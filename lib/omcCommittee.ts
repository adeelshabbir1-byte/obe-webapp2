import { prisma } from "./db";

// The OMC that decides for a department: its Convener (org chart position OMC_CONVENER of that department) and the
// members listed under it. Fallback when the chart has none: every OMC member of the institute, and whoever holds the
// OMC_CONVENER duty. A majority is more than half of everyone on the committee (Convener included).

const db = prisma as unknown as Record<string, any>;

export async function departmentOfProgram(chairmanId: string, program: string) {
  return ((await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program }, select: { departmentId: true } }))?.departmentId) || null;
}
export async function departmentOfBatch(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!b) return { chairmanId: "", departmentId: null as string | null };
  const chairmanId = b.coordinator.managedById || "";
  return { chairmanId, departmentId: (await departmentOfProgram(chairmanId, b.degreeProgram)) || b.coordinator.departmentId || null };
}
/** The department whose OMC reviews a course plan: the course's home department, else its program's. */
export async function departmentOfCourse(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectHomeDepartmentId: true, batchId: true } });
  if (!c) return { chairmanId: "", departmentId: null as string | null };
  const d = c.batchId ? await departmentOfBatch(c.batchId) : { chairmanId: "", departmentId: null };
  return { chairmanId: d.chairmanId, departmentId: c.subjectHomeDepartmentId || d.departmentId };
}

export type Committee = { convenerId: string | null; memberIds: string[]; all: string[]; names: Map<string, string> };
export async function omcCommittee(chairmanId: string, departmentId: string | null): Promise<Committee> {
  const pos = ((await db.orgPosition.findMany({ where: { chairmanId, role: "OMC_CONVENER", offAt: null, ...(departmentId ? { departmentId } : {}) }, select: { id: true, holderId: true } }).catch(() => [])) as { id: string; holderId: string | null }[]);
  let convenerId = pos.find((p) => p.holderId)?.holderId || null;
  let memberIds = ((await db.orgMember.findMany({ where: { positionId: { in: pos.map((p) => p.id).concat("none") } }, select: { userId: true } }).catch(() => [])) as { userId: string }[]).map((m) => m.userId);
  const staff = { isActive: true, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] };
  if (!convenerId) convenerId = (await prisma.user.findFirst({ where: { AND: [staff, { extraRoles: { has: "OMC_CONVENER" } }, ...(departmentId ? [{ departmentId }] : [])] }, select: { id: true } }))?.id || null;
  if (!memberIds.length) memberIds = ((await prisma.user.findMany({ where: { AND: [staff, { OR: [{ role: "OMC" }, { omcHat: true }] }, ...(departmentId ? [{ OR: [{ departmentId }, { departmentId: null }] }] : [])] } as any, select: { id: true } })) as { id: string }[]).map((u) => u.id);
  const all = Array.from(new Set([...(convenerId ? [convenerId] : []), ...memberIds]));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: all.concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return { convenerId, memberIds, all, names };
}
export const majority = (yes: number, total: number) => total > 0 && yes > total / 2;
/** Is this user on the committee / its Convener? (An OMC-role account with no chart counts as a member.) */
export const onCommittee = (c: Committee, userId: string) => c.all.includes(userId);
export const isConvener = (c: Committee, userId: string) => c.convenerId === userId;
