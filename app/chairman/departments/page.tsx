import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import DepartmentsManager from "../../../components/DepartmentsManager";
import { ensureDefaultDepartment } from "../../../lib/departments";

export default async function ChairmanDepartmentsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  await ensureDefaultDepartment(user.id);
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id }, select: { id: true, departmentId: true } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [rooms, departments, deptPrograms, batches, directStaff, faculty, facultyGroups] = await Promise.all([
    prisma.room.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }),
    prisma.departmentProgram.findMany({ where: { chairmanId: user.id } }),
    prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, select: { degreeProgram: true }, distinct: ["degreeProgram"] }),
    prisma.user.findMany({
      where: { managedById: user.id, isVisitingPlaceholder: false, role: { in: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "COURSE_ASSIGNER", "OMC", "HEAD_OF_DEPARTMENT"] } },
      select: { id: true, name: true, role: true, departmentId: true, secondaryRole: true, leadProgram: true }, orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"] } },
      select: { id: true, name: true, role: true, departmentId: true, managedById: true }, orderBy: { name: "asc" },
    }),
    prisma.faculty.findMany({ where: { chairmanId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const allPrograms = Array.from(new Set<string>([...batches.map((b) => b.degreeProgram), ...deptPrograms.map((d) => d.degreeProgram)])).sort();

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Departments</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Split your institute into departments. Each department has its own programs, heads, coordinators, course assigners and faculty.
        A program belongs to one department. Faculty can still be shared between departments later.
      </p>
      <DepartmentsManager faculties={facultyGroups}
        departments={departments.map((d) => ({ id: d.id, name: d.name, timetableMode: d.timetableMode }))}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, departmentId: r.departmentId }))}
        programsByDept={Object.fromEntries(departments.map((d) => [d.id, deptPrograms.filter((p) => p.departmentId === d.id).map((p) => p.degreeProgram)]))}
        allPrograms={allPrograms}
        people={[...directStaff, ...faculty].map((p) => ({ id: p.id, name: p.name, role: p.role, departmentId: p.departmentId || coordinators.find((c) => c.id === (p as { managedById?: string | null }).managedById)?.departmentId || null, alsoFaculty: (p as { secondaryRole?: string | null }).secondaryRole === "INSTRUCTOR", leadProgram: (p as { leadProgram?: string | null }).leadProgram || null, managerId: (p as { managedById?: string | null }).managedById || null }))}
      />
    </Shell>
  );
}
