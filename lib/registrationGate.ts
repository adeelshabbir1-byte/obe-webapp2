import { prisma } from "./db";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { departmentOfProgram } from "./omcCommittee";

// What holds registration of a batch back: each course offered (or due) this semester needs an OMC-approved Subject
// Expert plan — a course linked by content sync counts as approved when its base is (with a "please recheck" note) —
// and a course from another department needs its course → GA mapping confirmed by our OMC for this term.

const db = prisma as unknown as Record<string, any>;
export type Blocker = { courseId: string; code: string; title: string; reason: string; kind: "PLAN" | "FOREIGN_GA" };

export const termKey = (t: { termName: string; year: number } | null) => (t ? `${t.termName} ${t.year}` : "");

/** Is this course's plan approved? (own approval, OMC-finalised, or its content-sync base's approval) */
export async function planApproved(courseIds: string[]) {
  const cs = await prisma.course.findMany({ where: { id: { in: courseIds.concat("none") } }, select: { id: true, templateStatus: true, contentSyncMember: { select: { isBase: true, groupId: true } } } });
  const groups = cs.map((c) => c.contentSyncMember?.groupId).filter((x): x is string => !!x);
  const bases = await prisma.courseContentSyncMember.findMany({ where: { groupId: { in: groups.concat("none") }, isBase: true }, select: { groupId: true, course: { select: { templateStatus: true } } } });
  const states = ((await db.planState.findMany({ where: { courseId: { in: courseIds.concat("none") } } }).catch(() => [])) as { courseId: string; status: string; omcFinal: boolean }[]);
  const out = new Map<string, { ok: boolean; synced: boolean }>();
  for (const c of cs) {
    const ps = states.find((s) => s.courseId === c.id);
    const own = c.templateStatus === "approved" || ps?.status === "APPROVED";
    const base = c.contentSyncMember && !c.contentSyncMember.isBase ? bases.find((b) => b.groupId === c.contentSyncMember!.groupId) : null;
    const synced = !own && base?.course.templateStatus === "approved";
    out.set(c.id, { ok: own || !!synced, synced: !!synced });
  }
  return out;
}

export async function registrationBlockers(batchId: string, semesterNumber?: number | null): Promise<Blocker[]> {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, degreeProgram: true, coordinator: { select: { managedById: true } } } });
  if (!b) return [];
  const term = await prisma.currentTerm.findUnique({ where: { coordinatorId: b.coordinatorId } }).catch(() => null);
  const where = semesterNumber ? { batchId, semesterNumber } : { batchId, isOffered: true };
  const cs = await prisma.course.findMany({ where: { ...where, courseType: { notIn: LIST_TYPES } }, select: { id: true, code: true, title: true, subjectHomeDepartmentId: true } });
  if (!cs.length) return [];
  const ok = await planApproved(cs.map((c) => c.id));
  const ownDept = await departmentOfProgram(b.coordinator.managedById || "", b.degreeProgram);
  const tk = termKey(term);
  const fga = ((await db.foreignCourseGa.findMany({ where: { courseId: { in: cs.map((c) => c.id) }, term: tk } }).catch(() => [])) as { courseId: string; status: string }[]);
  const out: Blocker[] = [];
  for (const c of cs) {
    if (!ok.get(c.id)?.ok) out.push({ courseId: c.id, code: c.code, title: c.title, kind: "PLAN", reason: "Subject Expert plan not approved by the OMC" });
    if (ownDept && c.subjectHomeDepartmentId && c.subjectHomeDepartmentId !== ownDept && fga.find((f) => f.courseId === c.id)?.status !== "CONFIRMED")
      out.push({ courseId: c.id, code: c.code, title: c.title, kind: "FOREIGN_GA", reason: `Course → GA for ${tk || "this term"} not confirmed by our OMC (course from another department)` });
  }
  return out;
}
