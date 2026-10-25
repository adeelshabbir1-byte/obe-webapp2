import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import SetupWizard from "../../../components/SetupWizard";
import { FAMILIES, SHAPES, setupPositions } from "../../../lib/instituteSetup";

export const dynamic = "force-dynamic";

export default async function InstituteSetupPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");
  const [positions, people, depts] = await Promise.all([
    setupPositions(user.id).catch(() => []),
    prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }] }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.department.count({ where: { chairmanId: user.id } }),
  ]);
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Set up the institute</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>Day 1, on one page: the shape of the institute, its faculties, departments and programs, the logins of the people who run them, and who holds which position. Change anything later on the Departments page and the Organisation Chart.</p>
      <SetupWizard shapes={SHAPES} families={FAMILIES} hasStructure={depts > 0} chairmanId={user.id}
        positions={positions.map((p) => ({ id: p.id, title: p.title, role: p.role, facultyId: p.facultyId, departmentId: p.departmentId, program: p.program, holderId: p.holderId, covers: p.covers, scope: p.scope }))}
        people={[{ id: user.id, name: `${user.name} (you)`, email: user.email }, ...people]} />
    </Shell>
  );
}
