import { prisma } from "./db";

export const OVERVIEW_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"];
type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };

/** The Program Leads whose readiness this person may look at. */
export async function leadsInScope(user: Who) {
  if (!OVERVIEW_ROLES.includes(user.role)) return { chairmanId: "", leads: [] as Awaited<ReturnType<typeof query>> };
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  return { chairmanId, leads: await query(chairmanId, user) };
}
async function query(chairmanId: string, user: Who) {
  const scope = user.role === "DEAN" ? { department_: { facultyId: user.facultyId || "none" } } : user.role === "CHAIRMAN" ? {} : { departmentId: user.departmentId || "none" };
  return prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, isActive: true, isVisitingPlaceholder: false, ...scope } as never,
    select: { id: true, name: true, leadProgram: true, departmentId: true, managedById: true, department_: { select: { name: true } } },
    orderBy: [{ departmentId: "asc" }, { leadProgram: "asc" }],
  });
}
