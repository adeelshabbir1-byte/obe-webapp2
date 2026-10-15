import { prisma } from "./db";
import { BASE_COURSES } from "./courseKeys";
import { isExamTopic, norm, similarity } from "./teachingAnalysis";

// The program-wide topic overlap matrix: for every pair of (base) courses, the topics both teach. Each repeat is
// either an intentional progression (the later course builds on it — usually along the prerequisite chain or a topic
// link) or an accidental duplication to remove; the curriculum team records which.

const OVERLAP = 0.5;
export type MatrixCourse = { id: string; code: string; title: string; semester: number | null };
export type OverlapItem = { topicA: string; topicB: string; score: number; topicKey: string; suggested: "PROGRESSION" | "DUPLICATION"; verdict: string | null; note: string | null };
export type Matrix = { courses: MatrixCourse[]; cells: Record<string, OverlapItem[]>; recurring: { topic: string; codes: string[] }[]; reviewed: number; total: number };

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const topicKeyOf = (a: string, b: string) => [norm(a), norm(b)].sort().join(" ~ ").slice(0, 400);

export async function overlapMatrix(coordinatorId: string): Promise<Matrix> {
  const all = await prisma.course.findMany({ where: { coordinatorId, ...BASE_COURSES }, select: { id: true, code: true, title: true, semesterNumber: true, prerequisiteCourseId: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  // One course per code: the newest copy that has a lecture plan (a new batch's copy often has none yet), in curriculum order.
  const planned = new Set((await prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: all.map((c) => c.id) }, topic: { not: "" } } })).map((g) => g.courseId));
  const byCode = new Map<string, (typeof all)[number]>();
  for (const c of all) if (!byCode.has(c.code) || (!planned.has(byCode.get(c.code)!.id) && planned.has(c.id))) byCode.set(c.code, c);
  const courses = Array.from(byCode.values()).sort((x, y) => (x.semesterNumber ?? 99) - (y.semesterNumber ?? 99) || x.code.localeCompare(y.code));
  const ids = courses.map((c) => c.id);
  const rows = ids.length ? await prisma.lectureRow.findMany({ where: { courseId: { in: ids }, topic: { not: "" } }, select: { courseId: true, topic: true, source: true } }) : [];
  const topicsOf = new Map<string, string[]>();
  for (const c of courses) {
    const se = rows.filter((r) => r.courseId === c.id && r.source === "SE");
    const use = se.length ? se : rows.filter((r) => r.courseId === c.id && r.source === "INSTRUCTOR");
    const seen = new Set<string>();
    topicsOf.set(c.id, use.map((r) => r.topic.trim()).filter((t) => t && !isExamTopic(t) && !seen.has(norm(t)) && seen.add(norm(t))));
  }
  // Courses on one chain: formal prerequisites (by code, transitively) and topic links.
  const idToCode = new Map(all.map((c) => [c.id, c.code]));
  const preOf = new Map<string, string>();
  for (const c of all) if (c.prerequisiteCourseId && idToCode.has(c.prerequisiteCourseId)) preOf.set(c.code, idToCode.get(c.prerequisiteCourseId)!);
  const ancestors = (code: string) => { const out = new Set<string>(); let cur = preOf.get(code); for (let i = 0; cur && i < 12 && !out.has(cur); i++) { out.add(cur); cur = preOf.get(cur); } return out; };
  const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId }, select: { prereqCourseCode: true, dependentCourseCode: true, prereqTopic: true, dependentTopic: true } }).catch(() => []);
  const linked = new Set(links.map((l) => pairKey(l.prereqCourseCode, l.dependentCourseCode)));
  const onChain = (a: string, b: string) => linked.has(pairKey(a, b)) || ancestors(a).has(b) || ancestors(b).has(a);
  const reviews = await prisma.topicOverlapReview.findMany({ where: { coordinatorId } }).catch(() => []);
  const reviewOf = new Map(reviews.map((r) => [`${pairKey(r.codeA, r.codeB)}|${r.topicKey}`, r]));

  const cells: Record<string, OverlapItem[]> = {};
  let total = 0, reviewed = 0;
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i], b = courses[j];
      const ta = topicsOf.get(a.id) || [], tb = topicsOf.get(b.id) || [];
      const items: OverlapItem[] = [];
      for (const x of ta) {
        let best = 0, match = "";
        for (const y of tb) { const s = norm(x) === norm(y) ? 1 : similarity(x, y); if (s > best) { best = s; match = y; } }
        if (best < OVERLAP) continue;
        const topicKey = topicKeyOf(x, match);
        const r = reviewOf.get(`${pairKey(a.code, b.code)}|${topicKey}`);
        // Different semesters on one chain reads as progression; the same semester, or unrelated courses, as duplication.
        const suggested = a.semesterNumber !== b.semesterNumber && onChain(a.code, b.code) ? "PROGRESSION" : "DUPLICATION";
        items.push({ topicA: x, topicB: match, score: Math.round(best * 100) / 100, topicKey, suggested, verdict: r?.verdict || null, note: r?.note || null });
        total++; if (r) reviewed++;
      }
      if (items.length) cells[pairKey(a.code, b.code)] = items;
    }
  }
  // Topics taught in three or more courses.
  const groups: { topic: string; codes: Set<string> }[] = [];
  for (const c of courses) for (const t of topicsOf.get(c.id) || []) {
    const g = groups.find((x) => norm(x.topic) === norm(t) || similarity(x.topic, t) >= 0.8);
    if (g) g.codes.add(c.code); else groups.push({ topic: t, codes: new Set([c.code]) });
  }
  const recurring = groups.filter((g) => g.codes.size >= 3).map((g) => ({ topic: g.topic, codes: Array.from(g.codes) })).sort((x, y) => y.codes.length - x.codes.length).slice(0, 40);
  return { courses: courses.map((c) => ({ id: c.id, code: c.code, title: c.title, semester: c.semesterNumber })), cells, recurring, reviewed, total };
}
