import { prisma } from "./db";

// Subject Experts a course can borrow from its "subject home" department: for example a CS program's Management course
// takes its Subject Expert from Management Sciences. Only experts of OTHER coordinators in the same institute are listed
// (the coordinator's own experts are always available anyway).
export async function homeExpertsFor(chairmanId: string, ownCoordinatorId: string, departmentIds: string[]) {
  const ids = Array.from(new Set(departmentIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const experts = await prisma.user.findMany({
    where: {
      departmentId: { in: ids },
      OR: [
        { role: "SUBJECT_EXPERT", managedById: { not: ownCoordinatorId }, managedBy: { managedById: chairmanId } },
        { role: { in: ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] }, managedById: chairmanId, OR: [{ secondaryRole: "SUBJECT_EXPERT" }, { tertiaryRole: "SUBJECT_EXPERT" }] },
      ],
    },
    select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" },
  });
  return experts.map((e) => ({ id: e.id, name: e.name, departmentId: e.departmentId as string }));
}
