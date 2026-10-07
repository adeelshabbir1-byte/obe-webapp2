import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import DeptCoordinatorHome from "../../../components/DeptCoordinatorHome";

export default async function DeptCoordinatorHomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "DEPARTMENT_COORDINATOR") redirect("/dashboard");

  const [department, leads] = await Promise.all([
    prisma.department.findUnique({ where: { id: user.departmentId || "none" } }),
    prisma.user.findMany({
      where: { role: "PROGRAM_COORDINATOR", departmentId: user.departmentId || "none", managedById: user.managedById || "" },
      select: { id: true, name: true, leadProgram: true }, orderBy: { name: "asc" },
    }),
  ]);
  const ids = leads.map((l) => l.id);
  const [batches, teachers, terms] = await Promise.all([
    prisma.batch.groupBy({ by: ["coordinatorId"], where: { coordinatorId: { in: ids } }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["managedById"], where: { managedById: { in: ids }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, _count: { _all: true } }),
    prisma.currentTerm.findMany({ where: { coordinatorId: { in: ids } } }),
  ]);
  const count = (rows: { _count: { _all: number } }[] & { coordinatorId?: string; managedById?: string | null }[], id: string, key: "coordinatorId" | "managedById") =>
    (rows as any[]).find((r) => r[key] === id)?._count._all || 0;

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{department?.name || "My Department"} — Programs</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        You assist the Program Leads with what involves people, calendars and the timetable: teacher onboarding, students, the current semester and holidays, and the timetable.
        Choose a program to work on. Courses, curriculum and Subject Experts stay with each Program Lead.
      </p>
      <DeptCoordinatorHome
        actingForId={user.actingForId}
        programs={leads.map((l) => {
          const t = terms.find((x) => x.coordinatorId === l.id);
          return { id: l.id, program: l.leadProgram || "Program", lead: l.name, batches: count(batches as any, l.id, "coordinatorId"), teachers: count(teachers as any, l.id, "managedById"), term: t ? `${t.termName} ${t.year}` : null };
        })}
      />
    </Shell>
  );
}
