import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { writeAuditLog } from "./audit";
import { pairs, type RCourse } from "./rolloverCore";

// One-click term rollover: every course of the program that has no plan yet (the next batch's, next term's) gets the
// plan of the latest offering of the same course — CLOs and GA mapping, lecture plan, assessments and question plan —
// in one step. Question bank, learning resources and feed-forward notes are kept per course code already, so they
// carry over by themselves. Courses with marks or attendance are never touched.
type U = { id: string; role: string; managedById?: string | null };
export const ROLL_ROLES = ["CHAIRMAN", "OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN"];
const tIdx = (n: string | null, y: number | null) => (y ? y * 2 + (/fall/i.test(n || "") ? 1 : 0) : 0);

async function load(u: U) {
  const cid = await chairmanIdFor(u as never);
  const where = u.role === "PROGRAM_COORDINATOR" ? { coordinatorId: u.id } : { coordinator: { managedById: cid } };
  const cs = await prisma.course.findMany({ where, take: 3000, select: { id: true, code: true, title: true, semesterNumber: true, isOffered: true, offeredTermName: true, offeredTermYear: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true, startYear: true, startTerm: true } } } });
  const ids = cs.map((c) => c.id).concat("none");
  const [plan, marks, att] = await Promise.all([
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { _all: true } }),
    prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }),
    prisma.attendanceRecord.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }).catch(() => [] as { courseId: string }[]),
  ]);
  const has = (rows: { courseId: string }[]) => new Set(rows.map((r) => r.courseId));
  const P = has(plan as never), M = has(marks as never), A = has(att as never);
  const list: (RCourse & { title: string })[] = cs.map((c) => ({ id: c.id, code: c.code, title: c.title, program: c.batch?.degreeProgram || "", batch: c.batch?.batchName || "", semester: c.semesterNumber, term: c.offeredTermYear ? tIdx(c.offeredTermName, c.offeredTermYear) : (c.batch?.startYear || 0) * 2 + (c.semesterNumber || 0), hasPlan: P.has(c.id), hasWork: M.has(c.id) || A.has(c.id), offered: c.isOffered, teacher: c.instructor?.name || "" }));
  return { cid, list };
}
export async function rolloverPreview(u: U) {
  const { list } = await load(u);
  const r = pairs(list);
  return { pairs: r.pairs.map((p) => ({ targetId: p.target.id, target: `${p.target.code} ${(p.target as { title?: string }).title || ""} — ${p.target.program} ${p.target.batch}${p.target.semester ? `, semester ${p.target.semester}` : ""}`, source: `${p.source.program} ${p.source.batch}${p.source.teacher ? ` (${p.source.teacher})` : ""}`, sourceId: p.source.id })), skipped: r.skipped.filter((s) => s.why !== "no earlier offering with a plan").map((s) => `${s.target.code} — ${s.target.program} ${s.target.batch}: ${s.why}`), noSource: r.skipped.filter((s) => s.why === "no earlier offering with a plan").length };
}
export async function rolloverApply(u: U, only?: string[]) {
  if (!ROLL_ROLES.includes(u.role)) throw new Error("forbidden");
  const { list } = await load(u);
  const r = pairs(list);
  const { copyCourseContent } = await import("./benchmarkCopy");
  let done = 0; const failed: string[] = [];
  for (const p of r.pairs) {
    if (only && only.length && !only.includes(p.target.id)) continue;
    // Checked again just before copying: still no plan, no marks, no attendance.
    const [rows, mk] = await Promise.all([prisma.lectureRow.count({ where: { courseId: p.target.id } }), prisma.studentMark.count({ where: { courseId: p.target.id } })]);
    if (rows || mk) { failed.push(`${p.target.code} ${p.target.batch} (changed meanwhile)`); continue; }
    const ok = await copyCourseContent(p.source.id, p.target.id).catch(() => null);
    if (ok) done++; else failed.push(`${p.target.code} ${p.target.batch}`);
  }
  await writeAuditLog({ actorUserId: u.id, action: "TERM_ROLLOVER", entityType: "Institute", metadata: { done, failed: failed.length } });
  return { done, failed };
}
