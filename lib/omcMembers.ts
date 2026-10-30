import { prisma } from "./db";
import { approverIds } from "./approvers";
import { majorityOf, tallyVotes } from "./committeeCore";

// A department's OMC: the Convener and the members from the organisation chart (the OMC Convener position and its
// members); with no chart entry, the department's people who sit on the OMC. Used for batch approval, SE plan votes and
// the OMC's rules. A decision carries when more than half of the members agree.

const odb = prisma as unknown as Record<string, any>;
export type Member = { id: string; name: string };
export type Omc = { departmentId: string | null; convenerId: string | null; convenerName: string; members: Member[] };

const staff = (chairmanId: string) => ({ OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] });

export async function omcOf(chairmanId: string, departmentId: string | null): Promise<Omc> {
  let ids: string[] = [];
  let convenerId: string | null = null;
  const pos = departmentId ? await odb.orgPosition.findFirst({ where: { chairmanId, role: "OMC_CONVENER", departmentId } }).catch(() => null) : null;
  if (pos) {
    convenerId = pos.holderId || null;
    ids = ((await odb.orgMember.findMany({ where: { positionId: pos.id } }).catch(() => [])) as { userId: string }[]).map((m) => m.userId);
  }
  if (!convenerId) convenerId = (await approverIds(chairmanId, "OMC_CONVENER", { departmentId }).catch(() => [] as string[]))[0] || null;
  if (!ids.length) {
    const rows = await prisma.user.findMany({ where: { AND: [staff(chairmanId), { isActive: true }, departmentId ? { departmentId } : {}, { OR: [{ role: "OMC" }, { omcHat: true }, { extraRoles: { has: "OMC_CONVENER" } }] }] } as never, select: { id: true } }).catch(() => []);
    ids = rows.map((r) => r.id);
  }
  // A department with nobody on the OMC yet: the institute's OMC looks after it.
  if (!ids.length && departmentId) ids = (await omcOf(chairmanId, null)).members.map((m) => m.id);
  if (convenerId && !ids.includes(convenerId)) ids.push(convenerId);
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return { departmentId, convenerId, convenerName: people.find((p) => p.id === convenerId)?.name || "", members: people };
}

/** The OMC that looks after a batch: the department of its Program Lead. */
export async function omcOfBatch(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinator: { select: { departmentId: true, managedById: true } } } });
  if (!b) return null;
  return { chairmanId: b.coordinator.managedById || "", ...(await omcOf(b.coordinator.managedById || "", b.coordinator.departmentId || null)) };
}

/** The OMC that reviews a course: its subject's home department, else its program's department. */
export async function omcOfCourse(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectHomeDepartmentId: true, coordinator: { select: { departmentId: true, managedById: true } } } });
  if (!c) return null;
  return { chairmanId: c.coordinator.managedById || "", ...(await omcOf(c.coordinator.managedById || "", c.subjectHomeDepartmentId || c.coordinator.departmentId || null)) };
}

/** More than half of the members. (The committee engine's MAJORITY_OF_MEMBERS rule.) */
export const majority = (memberCount: number) => majorityOf(memberCount);

/** "Endorsed 3 of 5 · waiting: A, B" — yes / no / waiting from a list of votes, on the committee engine. */
export function tally(members: Member[], votes: { memberId: string; yes: boolean }[]) {
  const t = tallyVotes(members, votes.map((v) => ({ memberId: v.memberId, vote: v.yes ? "APPROVE" : "REJECT" })), { kind: "MAJORITY_OF_MEMBERS" });
  return { yes: t.yes, no: t.no, waiting: t.waiting, total: t.total, need: t.need, carried: t.carried, failed: t.failed };
}

export function isMember(omc: Omc, userId: string) {
  return omc.members.some((m) => m.id === userId);
}
