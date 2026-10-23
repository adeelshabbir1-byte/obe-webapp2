import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

type U = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };

/** Batches whose students this person may look up: the whole institute for the Institute Head, the Controller of
 * Examinations, QEC, OMC and Student Affairs; a Dean's faculty; an HOD's / department coordinator's department; a
 * Program Lead's own batches; plus, for anyone, the batches they advise and the batches of the courses they teach. */
export async function visibleBatchIds(user: U): Promise<string[]> {
  const chairmanId = await chairmanIdFor(user);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true } });
  const hats = me?.extraRoles || [];
  const inst = { coordinator: { managedById: chairmanId } };
  let where: Record<string, unknown> | null = null;
  if (user.role === "CHAIRMAN" || ["OMC", "STUDENT_AFFAIRS"].includes(user.role) || hats.includes("EXAM_CONTROLLER") || hats.includes("QEC_INCHARGE")) where = inst;
  else if (user.role === "DEAN") where = { coordinator: { managedById: chairmanId, department_: { facultyId: user.facultyId || "none" } } };
  else if (["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"].includes(user.role)) where = { coordinator: { managedById: chairmanId, departmentId: user.departmentId || "none" } };
  else if (user.role === "PROGRAM_COORDINATOR") where = { coordinatorId: user.id };
  const [scoped, advised, taught] = await Promise.all([
    where ? prisma.batch.findMany({ where, select: { id: true } }) : Promise.resolve([]),
    prisma.batch.findMany({ where: { advisorId: user.id }, select: { id: true } }),
    prisma.course.findMany({ where: { OR: [{ instructorId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }], batchId: { not: null } }, select: { batchId: true } }),
  ]);
  const ids = Array.from(new Set([...scoped.map((b) => b.id), ...advised.map((b) => b.id), ...taught.map((c) => c.batchId!)]));
  // The campus filter (multi-campus universities) narrows every list built on this.
  return (await import("./campus")).filterBatchesByCampus(ids);
}
