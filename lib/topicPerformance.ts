import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPassingCriteria } from "./passingCriteria";
import { topicResults } from "./topicLinks";
import { courseIdsForKey, keyOf } from "./courseKeys";
import { similarity } from "./teachingAnalysis";
import { db } from "./topicPlan";
import { lecturesVsResults, perfSummary, sectionCompare, topicKey, type PerfRow } from "./topicPlanCore";

// How students did on each topic, per offering: stored when a course result is approved (and once for past offerings
// by the back-fill). History is found by the course (every batch's copy and content-sync linked copies) and the topic
// — the lecture row it was stored from, else matching wording — and follows a topic moved to another course.

export async function storeTopicPerformance(courseId: string, sourceKind: "APPROVAL" | "BACKFILL" = "APPROVAL") {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, coordinatorId: true, offeredTermName: true, offeredTermYear: true, createdAt: true, batch: { select: { batchName: true, degreeProgram: true } }, coordinator: { select: { managedById: true } } } });
  if (!c) return 0;
  const result = await prisma.courseResult.findUnique({ where: { courseId }, select: { termName: true, termYear: true, decidedAt: true } }).catch(() => null);
  const crit = await getPassingCriteria(c.coordinator.managedById, undefined, { degreeProgram: c.batch?.degreeProgram || null }).catch(() => ({ cloPct: 50 }));
  const results = await topicResults(courseId, crit.cloPct);
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, topic: true } });
  const termLabel = `${result?.termName || c.offeredTermName || ""} ${result?.termYear || c.offeredTermYear || ""}`.trim() || null;
  const sections = await prisma.course.count({ where: { coordinatorId: c.coordinatorId, code: c.code, offeredTermName: c.offeredTermName, offeredTermYear: c.offeredTermYear } }).catch(() => 1);
  let n = 0;
  for (const r of results) {
    if (!r.students) continue;
    const key = topicKey(r.topic);
    const data = {
      coordinatorId: c.coordinatorId, courseCode: c.code, lectureRowId: rows.find((x) => topicKey(x.topic) === key)?.id || null, topic: r.topic, termLabel, batchLabel: c.batch?.batchName || null,
      offeredAt: result?.decidedAt || c.createdAt, students: r.students, avgPct: r.avgPct, belowPct: Math.round((1000 * r.below) / r.students) / 10,
      questions: r.items.length, assessments: new Set(r.items.map((i) => i.replace(/ Q.*$/, ""))).size, lectures: r.lectures.length, sections: Math.max(1, sections), sourceKind, storedAt: new Date(),
    };
    await db.topicPerformance.upsert({ where: { courseId_topicKey: { courseId, topicKey: key } }, create: { id: randomUUID(), courseId, topicKey: key, ...data }, update: data });
    n++;
  }
  return n;
}

/** One-time: every past offering with an approved result (or marks on a course no longer offered). */
export async function backfillTopicPerformance(chairmanId?: string) {
  const scope = chairmanId ? { coordinator: { managedById: chairmanId } } : {};
  const approved = await prisma.courseResult.findMany({ where: { status: "APPROVED" }, select: { courseId: true } }).catch(() => []);
  const courses = await prisma.course.findMany({ where: { ...scope, OR: [{ id: { in: approved.map((a) => a.courseId).concat("none") } }, { isOffered: false, studentMarks: { some: {} } }] }, select: { id: true } }).catch(async () => prisma.course.findMany({ where: { ...scope, id: { in: approved.map((a) => a.courseId).concat("none") } }, select: { id: true } }));
  let offerings = 0, rows = 0;
  for (const c of courses) {
    if (await db.topicPerformance.count({ where: { courseId: c.id, sourceKind: "APPROVAL" } })) continue; // stored at approval already
    const k = await storeTopicPerformance(c.id, "BACKFILL").catch(() => 0);
    if (k) { offerings++; rows += k; }
  }
  // Imported historical grades (HistoricalRecord) carry course-level marks only, so they add no topic rows.
  return { offerings, rows };
}

type Stored = PerfRow & { id: string; courseId: string; coordinatorId: string; topicKey: string; topic: string; lectureRowId: string | null; batchLabel: string | null };
/** History per lecture row of a plan: same course across terms (and linked copies); a moved topic brings its old course's history. */
export async function historyFor(courseId: string, rows: { id: string; topic: string; movedFrom?: string | null }[]) {
  const key = await keyOf(courseId);
  if (!key) return new Map<string, { history: Stored[]; from: string[] }>();
  const ids = await courseIdsForKey(key).catch(() => [courseId]);
  const extraCodes = Array.from(new Set(rows.map((r) => r.movedFrom).filter((x): x is string => !!x)));
  const all = ((await db.topicPerformance.findMany({ where: { OR: [{ courseId: { in: ids.concat(courseId) } }, { coordinatorId: key.coordinatorId, courseCode: { in: [key.code, ...extraCodes] } }] } }).catch(() => [])) as Stored[]);
  const out = new Map<string, { history: Stored[]; from: string[] }>();
  for (const r of rows) {
    const k = topicKey(r.topic);
    const sameCourse = all.filter((p) => p.courseCode === key.code || ids.includes(p.courseId));
    const exact = sameCourse.some((p) => p.topicKey === k);
    const mine = all.filter((p) => p.lectureRowId === r.id || (sameCourse.includes(p) && (p.topicKey === k || (!exact && similarity(p.topic, r.topic) >= 0.6))));
    const moved = r.movedFrom ? all.filter((p) => p.courseCode === r.movedFrom && p.topicKey === k) : [];
    const h = Array.from(new Map(mine.concat(moved).map((p) => [p.id, p])).values());
    out.set(r.id, { history: h, from: moved.length ? [r.movedFrom!] : [] });
  }
  return out;
}

/** Hover text data for a plan's rows. */
export async function performanceOf(courseId: string, rows: { id: string; topic: string; movedFrom?: string | null }[], min = 30) {
  const h = await historyFor(courseId, rows);
  const out: Record<string, { overall: ReturnType<typeof perfSummary>; last3: ReturnType<typeof perfSummary>; last: ReturnType<typeof perfSummary>; vsLectures: ReturnType<typeof lecturesVsResults>; from: string[]; offerings: { term: string | null; batch: string | null; students: number; avg: number | null; lectures: number }[] }> = {};
  for (const r of rows) {
    const x = h.get(r.id);
    if (!x || !x.history.length) continue;
    out[r.id] = {
      overall: perfSummary(x.history, "overall", min), last3: perfSummary(x.history, "last3", min), last: perfSummary(x.history, "last", min),
      vsLectures: lecturesVsResults(x.history), from: x.from,
      offerings: x.history.map((p) => ({ term: p.termLabel, batch: p.batchLabel, students: p.students, avg: p.avgPct, lectures: p.lectures })),
    };
  }
  return out;
}

/** The hardest topics in a program (for the Program Lead and the OMC): lowest average over enough students. */
export async function hardestTopics(coordinatorIds: string[], min = 30, take = 25) {
  const all = ((await db.topicPerformance.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } } }).catch(() => [])) as Stored[]);
  const g = new Map<string, Stored[]>();
  for (const p of all) g.set(`${p.coordinatorId}|${p.courseCode}|${p.topicKey}`, (g.get(`${p.coordinatorId}|${p.courseCode}|${p.topicKey}`) || []).concat(p));
  return Array.from(g.values()).map((list) => ({ code: list[0].courseCode, topic: list[0].topic, ...perfSummary(list, "overall", min) }))
    .filter((x) => !x.tooLittle).sort((a, b) => (a.shown?.avg ?? 100) - (b.shown?.avg ?? 100)).slice(0, take)
    .map((x) => ({ code: x.code, topic: x.topic, avg: x.shown!.avg, below: x.shown!.below, students: x.shown!.students, offerings: x.offerings, trend: x.trend }));
}

/** Sections of the same course in the same term compared on a topic (Program Lead / OMC only; small sections hidden). */
export async function sectionsCompared(coordinatorIds: string[], minSection = 15) {
  const all = ((await db.topicPerformance.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } }, orderBy: { storedAt: "desc" }, take: 5000 }).catch(() => [])) as (Stored & { coordinatorId: string })[]);
  const g = new Map<string, Stored[]>();
  for (const p of all) { const k = `${p.courseCode}|${p.termLabel}|${p.topicKey}`; g.set(k, (g.get(k) || []).concat(p)); }
  const out: { code: string; term: string | null; topic: string; sections: { section: string; students: number; avgPct: number | null }[]; gap: number }[] = [];
  for (const list of Array.from(g.values())) {
    if (list.length < 2) continue;
    const s = sectionCompare(list.map((p) => ({ section: p.batchLabel || p.courseId.slice(-4), students: p.students, avgPct: p.avgPct })), minSection);
    if (s.length < 2) continue;
    out.push({ code: list[0].courseCode, term: list[0].termLabel, topic: list[0].topic, sections: s, gap: Math.round(10 * ((s[s.length - 1].avgPct ?? 0) - (s[0].avgPct ?? 0))) / 10 });
  }
  return out.sort((a, b) => b.gap - a.gap).slice(0, 30);
}
