import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import FacultyManager from "../../../components/FacultyManager";
import { navForRole } from "../../../components/reportNav";


export default async function CoordinatorFacultyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER"] }, managedById: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Program Leads, the department's Chairman and Program Coordinator: they hold a role, so they are not in the list above,
  // but several of them also teach. Shown here read-only so the whole teaching team is visible.
  const roleHolders = user.departmentId ? await prisma.user.findMany({
    where: { departmentId: user.departmentId, isVisitingPlaceholder: false, isActive: true, role: { in: ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true, role: true, leadProgram: true, secondaryRole: true, tertiaryRole: true },
  }) : [];
  const roleName: Record<string, string> = { PROGRAM_COORDINATOR: "Program Lead", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator" };
  const hatName: Record<string, string> = { INSTRUCTOR: "Teaches", SUBJECT_EXPERT: "Subject Expert" };

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Onboarding</h1>
        <a href="/api/coordinator/faculty/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Create Subject Expert and Course Instructor accounts, and set each instructor's normal teaching load.
      </p>
      {roleHolders.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Program Leads and other role holders in your department</h3>
          <p style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 0 }}>These people hold a leadership role, so they are managed by the Institute Head or the Chairman, not from this page. Those who also teach can be given courses.</p>
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Also</th></tr></thead>
            <tbody>{roleHolders.map((h) => (
              <tr key={h.id}>
                <td>{h.name}{h.id === user.id ? " (you)" : ""}</td>
                <td>{roleName[h.role]}{h.leadProgram ? ` — ${h.leadProgram}` : ""}</td>
                <td>{[h.secondaryRole, h.tertiaryRole].filter((r): r is string => !!r && !!hatName[r]).map((r) => hatName[r]).join(", ") || <span style={{ color: "var(--slate)" }}>—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <FacultyManager
        initialFaculty={faculty.map((f) => ({
          id: f.id, username: f.username, name: f.name, role: f.role, mustChangePassword: f.mustChangePassword,
          normalLoad: f.normalLoad, externalLoadCount: f.externalLoadCount, externalLoadNote: f.externalLoadNote, specialization: f.specialization, secondaryRole: f.secondaryRole, canTeach: f.canTeach, organization: f.organization,
        }))}
      />
    </Shell>
  );
}
