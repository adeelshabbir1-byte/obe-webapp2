import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import LabEngineerAssign from "../../../components/LabEngineerAssign";

export default async function LabEngineersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [labs, engineers, theories] = await Promise.all([
    prisma.course.findMany({ where: { coordinatorId: user.id, courseType: "Lab", isOffered: true }, include: { batch: true, instructor: { select: { name: true } }, labEngineer: { select: { id: true } } }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { role: "LAB_ENGINEER", managedById: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true, courseType: { not: "Lab" } }, select: { code: true, batchId: true, instructor: { select: { name: true } } } }),
  ]);
  const leadOf = (l: any) => l.instructor?.name || theories.find((t: any) => t.batchId === l.batchId && t.code === l.code.replace(/-L$/i, ""))?.instructor?.name || "—";
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Lab Engineers</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Choose the Lab Engineer of each lab offered this semester. The Lab Engineer uploads lab manuals and enters lab marks. The lab lead is the course instructor (the theory course instructor unless the lab has its own).
        Add Lab Engineers under Teacher Onboarding first.
      </p>
      {engineers.length === 0 && <div className="card" style={{ color: "#8a5a00" }}>No Lab Engineer has been added yet. Use Teacher Onboarding and choose the role “Lab Engineer”.</div>}
      <div className="card">
        {labs.length === 0 ? <p style={{ color: "var(--slate)" }}>No lab course is offered this semester.</p> : (
          <table>
            <thead><tr><th>Lab</th><th>Batch</th><th>Lab lead</th><th>Lab Engineer</th></tr></thead>
            <tbody>{labs.map((l: any) => (
              <tr key={l.id}><td><b>{l.code}</b> — {l.title}</td><td style={{ fontSize: 12 }}>{l.batch.degreeProgram} {l.batch.batchName}</td><td>{leadOf(l)}</td>
                <td><LabEngineerAssign courseId={l.id} current={l.labEngineer?.id || null} engineers={engineers} /></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
