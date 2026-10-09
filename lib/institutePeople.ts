import { prisma } from "./db";

export const ROLE_TEXT: Record<string, string> = {
  CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator",
  COURSE_ASSIGNER: "Course Assigner", OMC: "OMC member", SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Course Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager", LIBRARIAN: "Librarian", FINANCE_OFFICER: "Finance Officer",
};
const ORDER = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "COURSE_ASSIGNER", "OMC", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER"];

export type PersonRow = { id: string; username: string; name: string; email: string; role: string; also: string; department: string; program: string; status: string };

/** Everyone who works in this institute, with their login name, role and the extra roles they can also work as. */
export async function institutePeople(chairmanId: string): Promise<PersonRow[]> {
  const [coordinators, departments] = await Promise.all([
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } }),
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
  ]);
  const users = await prisma.user.findMany({
    where: { isVisitingPlaceholder: false, OR: [{ managedById: chairmanId }, { managedById: { in: coordinators.map((c) => c.id) } }] },
    select: { id: true, username: true, name: true, email: true, role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true, omcHat: true, assignerTerm: true, leadProgram: true, departmentId: true, managedById: true, mustChangePassword: true, isActive: true },
  });
  const leadOf = new Map<string, { leadProgram: string | null; departmentId: string | null }>(coordinators.length ? (await prisma.user.findMany({ where: { id: { in: coordinators.map((c) => c.id) } }, select: { id: true, leadProgram: true, departmentId: true } })).map((c) => [c.id, c]) : []);
  const deptName = (id: string | null | undefined) => departments.find((d) => d.id === id)?.name || "—";
  return users
    .map((u) => {
      const parent = u.managedById ? leadOf.get(u.managedById) : undefined;
      const isTeaching = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"].includes(u.role);
      const also = [u.secondaryRole, u.tertiaryRole, ...u.extraRoles].filter((r): r is string => !!r).map((r) => ROLE_TEXT[r] || r);
      if (u.omcHat) also.push("OMC member");
      if (u.assignerTerm) also.push(u.assignerTerm === "ALWAYS" ? "Course Assigner" : `Course Assigner (${u.assignerTerm})`);
      return {
        id: u.id, username: u.username, name: u.name, email: u.email, role: ROLE_TEXT[u.role] || u.role, also: also.join(", "),
        department: deptName(u.departmentId || (isTeaching ? parent?.departmentId : null)),
        program: u.role === "PROGRAM_COORDINATOR" ? u.leadProgram || "no program yet" : isTeaching ? parent?.leadProgram || "—" : "—",
        status: !u.isActive ? "Switched off" : u.mustChangePassword ? "Temporary password" : "Active",
        _o: ORDER.indexOf(u.role),
      };
    })
    .sort((a, b) => a._o - b._o || a.name.localeCompare(b.name))
    .map(({ _o, ...r }) => r);
}
