import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";

export default async function ChairmanCoordinatorsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [coordinators, assistants, departments] = await Promise.all([
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { role: "DEPARTMENT_COORDINATOR", managedById: user.id }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { chairmanId: user.id }, select: { id: true, name: true } }),
  ]);
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={[{ href: "/chairman/faculty-workload", label: "Teacher Work Progress" }, { href: "/chairman/coordinators", label: "Program Leads" }, { href: "/chairman/plos", label: "Program Learning Outcomes" }, { href: "/chairman/omc", label: "OMC Members" }, { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/course-leads", label: "Course Leads" }, { href: "/chairman/departments", label: "Departments" }, { href: "/chairman/cqi", label: "CQI Records" }, { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" }, { href: "/omc/course-repositioning", label: "Course Repositioning" }, { href: "/coordinator/program-semester-map", label: "Program Semester Map" }, { href: "/chairman/report-access", label: "Report Access Control" }, { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" }, { href: "/chairman/ai-configuration", label: "AI Configuration" }, { href: "/omc/reports", label: "Reports" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Leads</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A Program Lead looks after one program of a department: its batches, courses, faculty and timetable. A person with no program yet is shown as “no program yet”;
        give them one under Departments. The department’s Program Coordinator (the Program Leads’ assistant) is listed separately below.
      </p>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Department</th><th>Leads program</th></tr></thead>
          <tbody>
            {coordinators.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No Program Leads yet.</td></tr>
            )}
            {coordinators.map((c) => (
              <tr key={c.id}><td>{c.username}</td><td>{c.name}</td><td>{c.email}</td><td>{deptName(c.departmentId)}</td>
                <td>{c.leadProgram || <span style={{ color: "#8a5a00" }}>no program yet</span>}</td></tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Program Coordinators (one per department)</h3>
        <p style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 0 }}>The assistant to the Program Leads. Add or change them under Departments.</p>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Department</th></tr></thead>
          <tbody>
            {assistants.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No Program Coordinator yet.</td></tr>}
            {assistants.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{deptName(c.departmentId)}</td></tr>)}
          </tbody>
        </table>
      </div>

      <CreateUserForm endpoint="/api/chairman/coordinators" buttonLabel="Create Program Lead" />
    </Shell>
  );
}
