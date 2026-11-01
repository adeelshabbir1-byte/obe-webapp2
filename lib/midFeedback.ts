import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chainFor, numberSetting } from "./scopedSettings";
import { notifyStudents } from "./studentNotices";
import { writeAuditLog } from "./audit";

// Mid-semester feedback (Adeel prompt §6): a 2-minute survey per course opening in week N (setting "feedback.midWeek",
// default 6) for 14 days: pace, clarity, the hardest topic so far (from the topics taught so far) and one comment.
// Anonymous to the teacher; nothing shows until 5 responses. The teacher sees a suggested action that links to the CQI.
const db = prisma as unknown as Record<string, any>;
export const MIN_RESPONSES = 5;

/** The first teaching day of a course's term (academic calendar), or null. */
export async function termStart(chairmanId: string, termName: string | null, termYear: number | null) {
  if (!termName || !termYear) return null;
  const rows = ((await db.academicCalendarEntry?.findMany({ where: { chairmanId, termName, termYear }, orderBy: { startDate: "asc" } }).catch(() => [])) || []) as { kind: string; title: string; startDate: Date }[];
  const start = rows.find((r) => /start|commence|classes begin/i.test(`${r.kind} ${r.title}`)) || rows[0];
  return start ? new Date(start.startDate) : null;
}
export const weekNo = (start: Date, now = new Date()) => Math.floor((now.getTime() - start.getTime()) / (7 * 864e5)) + 1;

async function windowOf(course: { id: string; offeredTermName: string | null; offeredTermYear: number | null; coordinator: { id: string; role: string; managedById: string | null; departmentId: string | null } }, now = new Date()) {
  const chain = await chainFor(course.coordinator as never);
  const start = await termStart(chain.chairmanId, course.offeredTermName, course.offeredTermYear);
  if (!start) return null;
  const week = await numberSetting(chain, "feedback.midWeek", 6);
  const opens = new Date(start.getTime() + (week - 1) * 7 * 864e5);
  return { opens, closes: new Date(opens.getTime() + 14 * 864e5), week, current: weekNo(start, now), chairmanId: chain.chairmanId };
}

/** Courses of a student whose survey is open now, with the topics taught so far (2 lectures a week). */
export async function openFor(studentId: string, now = new Date()) {
  const en = await prisma.studentEnrollment.findMany({ where: { studentId, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { id: true, role: true, managedById: true, departmentId: true } } } } } });
  const done = new Set((((await db.midFeedbackDone?.findMany({ where: { studentId } }).catch(() => [])) || []) as { courseId: string }[]).map((d) => d.courseId));
  const out: { courseId: string; code: string; title: string; closes: Date; topics: string[] }[] = [];
  for (const e of en) {
    if (done.has(e.course.id)) continue;
    const w = await windowOf(e.course, now);
    if (!w || now < w.opens || now > w.closes) continue;
    const topics = (await prisma.lectureRow.findMany({ where: { courseId: e.course.id, source: "SE", lectureNumber: { lte: Math.max(2, w.current * 2) } }, orderBy: { lectureNumber: "asc" }, select: { topic: true } })).map((t) => t.topic);
    out.push({ courseId: e.course.id, code: e.course.code, title: e.course.title, closes: w.closes, topics: Array.from(new Set(topics)) });
  }
  return out;
}

export async function submit(studentId: string, courseId: string, a: { pace: string; clarity: number; hardestTopic?: string; comment?: string }) {
  if (!db.midFeedback) throw new Error("Run prisma/migration_adeel_p7.sql in Supabase first.");
  if (!(await openFor(studentId)).some((c) => c.courseId === courseId)) throw new Error("This survey isn't open for you.");
  if (!["SLOW", "RIGHT", "FAST"].includes(a.pace) || !(a.clarity >= 1 && a.clarity <= 5)) throw new Error("Answer pace and clarity.");
  await db.midFeedbackDone.create({ data: { courseId, studentId } });
  await db.midFeedback.create({ data: { id: randomUUID(), courseId, pace: a.pace, clarity: Math.round(a.clarity), hardestTopic: a.hardestTopic ? a.hardestTopic.slice(0, 200) : null, comment: a.comment ? a.comment.slice(0, 600) : null } });
}

/** Results for the teacher (only from 5 responses), with the suggested action. */
export async function resultsOf(courseId: string) {
  const rows = ((await db.midFeedback?.findMany({ where: { courseId } }).catch(() => [])) || []) as { pace: string; clarity: number; hardestTopic: string | null; comment: string | null }[];
  if (rows.length < MIN_RESPONSES) return { n: rows.length, ready: false as const };
  const pace = { SLOW: 0, RIGHT: 0, FAST: 0 } as Record<string, number>; rows.forEach((r) => (pace[r.pace] = (pace[r.pace] || 0) + 1));
  const topics = new Map<string, number>(); rows.forEach((r) => r.hardestTopic && topics.set(r.hardestTopic, (topics.get(r.hardestTopic) || 0) + 1));
  const top = Array.from(topics.entries()).sort((a, b) => b[1] - a[1]);
  const clarity = Math.round((10 * rows.reduce((a, r) => a + r.clarity, 0)) / rows.length) / 10;
  const hard = top[0] ? { topic: top[0][0], pct: Math.round((100 * top[0][1]) / rows.length) } : null;
  const suggestion = hard && hard.pct >= 30 ? `${hard.topic} is hardest for ${hard.pct}% — consider a tutorial or a re-teach (CQI).` : pace.FAST > rows.length / 2 ? "Most find the pace too fast — slow down and add worked examples." : clarity < 3 ? "Clarity is low — add examples and check understanding in class." : "No action needed.";
  return { n: rows.length, ready: true as const, pace, clarity, topics: top.slice(0, 5).map(([t, n]) => ({ topic: t, pct: Math.round((100 * n) / rows.length) })), comments: rows.map((r) => r.comment).filter(Boolean).slice(0, 30) as string[], suggestion };
}

/** Daily: tell enrolled students when a course's survey opens (once per course). */
export async function openMidFeedback(now = new Date()) {
  const courses = await prisma.course.findMany({ where: { isOffered: true }, select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { id: true, role: true, managedById: true, departmentId: true } } }, take: 3000 });
  let n = 0;
  for (const c of courses) {
    const w = await windowOf(c, now).catch(() => null);
    if (!w || now < w.opens || now > new Date(w.opens.getTime() + 864e5 * 2)) continue;
    const already = await prisma.auditLog.findFirst({ where: { action: "MID_FEEDBACK_OPENED", entityId: c.id, createdAt: { gte: new Date(w.opens.getTime() - 864e5) } } });
    if (already) continue;
    const ids = (await prisma.studentEnrollment.findMany({ where: { courseId: c.id, status: "ACTIVE" }, select: { studentId: true } })).map((e) => e.studentId);
    await notifyStudents(ids, { kind: "BROADCAST", title: `2-minute feedback: ${c.code} ${c.title}`, body: "Anonymous — tell your teacher how the course is going.", href: "/student/mid-feedback" }, w.chairmanId);
    await writeAuditLog({ action: "MID_FEEDBACK_OPENED", entityType: "Course", entityId: c.id }).catch(() => null);
    n++;
  }
  return n;
}
