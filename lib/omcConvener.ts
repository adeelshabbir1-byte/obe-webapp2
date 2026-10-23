import { prisma } from "./db";
import { omcCourseScope } from "./omcScope";

const odb = prisma as unknown as Record<string, any>;

/** The OMC Convener's department: members (chart members, else the department's OMC people), and the review load. */
export async function convenerView(user: { id: string; managedById: string | null; departmentId?: string | null }, chairmanId: string) {
  const departmentId = user.departmentId || null;
  if (!departmentId) return null;
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
  const pos = await odb.orgPosition.findFirst({ where: { chairmanId, role: "OMC_CONVENER", departmentId } }).catch(() => null);
  const chartMembers: string[] = pos ? ((await odb.orgMember.findMany({ where: { positionId: pos.id } }).catch(() => [])) as { userId: string }[]).map((m) => m.userId) : [];
  const staff = { OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] };
  const people = await prisma.user.findMany({
    where: chartMembers.length ? { id: { in: chartMembers.concat(user.id) } } : { AND: [staff, { departmentId, isActive: true }, { OR: [{ role: "OMC" }, { omcHat: true }, { id: user.id }] }] } as never,
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const courses = await prisma.course.findMany({
    where: { coordinator: { managedById: chairmanId }, templateStatus: { in: ["submitted", "changes-requested"] }, ...(omcCourseScope({ role: "OMC", departmentId }) as object) },
    select: { id: true, code: true, title: true, templateStatus: true, assignedOmcReviewerId: true, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: { code: "asc" },
  });
  return { department: dept?.name || "", departmentId, members: people, courses };
}

/** Share the unassigned reviews among the members, fewest open reviews first. */
export async function shareOut(view: NonNullable<Awaited<ReturnType<typeof convenerView>>>) {
  if (!view.members.length) return 0;
  const load = new Map(view.members.map((m) => [m.id, view.courses.filter((c) => c.assignedOmcReviewerId === m.id).length]));
  let n = 0;
  for (const c of view.courses.filter((x) => !x.assignedOmcReviewerId || !load.has(x.assignedOmcReviewerId))) {
    const who = Array.from(load.entries()).sort((a, b) => a[1] - b[1])[0][0];
    await prisma.course.update({ where: { id: c.id }, data: { assignedOmcReviewerId: who } });
    load.set(who, (load.get(who) || 0) + 1); n++;
  }
  return n;
}
