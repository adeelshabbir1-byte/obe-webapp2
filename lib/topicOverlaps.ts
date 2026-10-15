import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { isExamTopic, norm, similarity } from "./teachingAnalysis";
import { linksForCode } from "./topicLinks";

// For one course: which other courses of the program teach the same topics (overlaps), and where the course sits in
// the prerequisite chain — the courses it needs and the courses that need it — with the topic-level links.

type Who = { id: string; role: string; managedById: string | null };
type Node = { id: string; code: string; title: string; semester: number | null; depth: number };
export type OverlapPair = { mine: string; theirs: string; score: number };
export type TopicOverlaps = {
  course: { id: string; code: string; title: string; semester: number | null };
  upstream: Node[]; downstream: Node[];
  links: { prereqCourseCode: string; prereqTopic: string; dependentCourseCode: string; dependentTopic: string }[];
  overlaps: { id: string; code: string; title: string; semester: number | null; pairs: OverlapPair[] }[];
};

const OVERLAP = 0.5;

async function plan(courseId: string) {
  let rows = await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
  if (!rows.length) rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
  const seen = new Set<string>();
  return rows.map((r) => r.topic.trim()).filter((t) => t && !isExamTopic(t) && !seen.has(norm(t)) && seen.add(norm(t)));
}

export async function overlapsFor(user: Who, courseId: string): Promise<TopicOverlaps | null> {
  const chairmanId = await chairmanIdFor(user);
  const course = await prisma.course.findFirst({ where: { id: courseId, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true, semesterNumber: true, coordinatorId: true, batchId: true, prerequisiteCourseId: true } });
  if (!course) return null;
  // The program's courses, one per code (this course's batch first, else the newest copy).
  const all = await prisma.course.findMany({ where: { coordinatorId: course.coordinatorId }, select: { id: true, code: true, title: true, semesterNumber: true, batchId: true, prerequisiteCourseId: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  const byCode = new Map<string, (typeof all)[number]>();
  for (const c of all) {
    const have = byCode.get(c.code);
    if (!have || (c.batchId === course.batchId && have.batchId !== course.batchId)) byCode.set(c.code, c);
  }
  const byId = new Map(all.map((c) => [c.id, c]));

  // Chain through the formal prerequisites (by code, so other batches' copies count too).
  const node = (c: (typeof all)[number], depth: number): Node => ({ id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, depth });
  const upstream: Node[] = [];
  let cur = course.prerequisiteCourseId ? byId.get(course.prerequisiteCourseId) : undefined;
  for (let d = 1; cur && d <= 4 && !upstream.some((n) => n.code === cur!.code) && cur.code !== course.code; d++) {
    const rep = byCode.get(cur.code) || cur;
    upstream.push(node(rep, d));
    cur = rep.prerequisiteCourseId ? byId.get(rep.prerequisiteCourseId) : undefined;
  }
  const downstream: Node[] = [];
  let frontier = [course.code];
  for (let d = 1; d <= 3 && frontier.length; d++) {
    const next: string[] = [];
    for (const c of Array.from(byCode.values())) {
      const pre = c.prerequisiteCourseId ? byId.get(c.prerequisiteCourseId) : undefined;
      if (pre && frontier.includes(pre.code) && c.code !== course.code && !downstream.some((n) => n.code === c.code)) { downstream.push(node(c, d)); next.push(c.code); }
    }
    frontier = next;
  }
  const { asPrereq, asDependent } = await linksForCode(course.coordinatorId, course.code);
  // Topic links also put a course on the chain even when it is not a formal prerequisite.
  for (const l of asDependent) if (!upstream.some((n) => n.code === l.prereqCourseCode)) { const c = byCode.get(l.prereqCourseCode); if (c) upstream.push(node(c, 1)); }
  for (const l of asPrereq) if (!downstream.some((n) => n.code === l.dependentCourseCode)) { const c = byCode.get(l.dependentCourseCode); if (c) downstream.push(node(c, 1)); }

  // Overlapping topics with every other course of the program.
  const mine = await plan(course.id);
  const overlaps: TopicOverlaps["overlaps"] = [];
  if (mine.length) {
    for (const c of Array.from(byCode.values())) {
      if (c.code === course.code) continue;
      const theirs = await plan(c.id);
      const pairs: OverlapPair[] = [];
      for (const m of mine) {
        let best = 0, match = "";
        for (const t of theirs) { const s = norm(m) === norm(t) ? 1 : similarity(m, t); if (s > best) { best = s; match = t; } }
        if (best >= OVERLAP) pairs.push({ mine: m, theirs: match, score: Math.round(best * 100) / 100 });
      }
      if (pairs.length) overlaps.push({ id: c.id, code: c.code, title: c.title, semester: c.semesterNumber, pairs });
    }
  }
  overlaps.sort((a, b) => b.pairs.length - a.pairs.length);
  return {
    course: { id: course.id, code: course.code, title: course.title, semester: course.semesterNumber },
    upstream, downstream,
    links: [...asDependent, ...asPrereq].map((l) => ({ prereqCourseCode: l.prereqCourseCode, prereqTopic: l.prereqTopic, dependentCourseCode: l.dependentCourseCode, dependentTopic: l.dependentTopic })),
    overlaps,
  };
}
