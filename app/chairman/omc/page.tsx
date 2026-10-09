import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";
import GiveRole from "../../../components/GiveRole";
import OmcHatButton from "../../../components/OmcHatButton";

const NAV = [
  { href: "/chairman/faculty-workload", label: "Teacher Work Progress" },
  { href: "/chairman/coordinators", label: "Program Leads" }, { href: "/course-split", label: "Course Split" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/lab-inventory", label: "Lab Inventory" }, { href: "/library-inventory", label: "Library Inventory" }, { href: "/chairman/finance", label: "Finance" }, { href: "/accreditation-overview", label: "Accreditation Overview" }, { href: "/deadlines", label: "Deadlines" }, { href: "/academic-calendar", label: "Academic Calendar" }, { href: "/admission-criteria", label: "Admission Criteria" }, { href: "/move-program", label: "Move Program Data" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" }, { href: "/chairman/people", label: "All Users and Roles" },
  { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/course-leads", label: "Course Leads" }, { href: "/chairman/departments", label: "Departments" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" }, { href: "/omc/course-repositioning", label: "Course Repositioning" }, { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" },
  { href: "/chairman/ai-configuration", label: "AI Configuration" }, { href: "/omc/reports", label: "Reports" },
];

export default async function ChairmanOmcPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [omcMembers, facultyMembers] = await Promise.all([
    prisma.user.findMany({ where: { role: "OMC", managedById: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({
      where: { isVisitingPlaceholder: false, isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] }, OR: [{ managedBy: { managedById: user.id } }, { managedById: user.id }] },
      select: { id: true, name: true, email: true, role: true, omcHat: true }, orderBy: { name: "asc" },
    }),
  ]);
  const facultyOmc = facultyMembers.filter((f) => f.omcHat);
  const candidates = facultyMembers.filter((f) => !f.omcHat && (f.role === "INSTRUCTOR" || f.role === "SUBJECT_EXPERT"));

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OMC Members</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        The Outcome Management Committee reviews and approves Subject Expert course templates. A member is either a faculty member of your institute (keeps their teacher login and chooses the OMC role at sign-in) or someone from industry with their own OMC login.
      </p>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>From</th></tr></thead>
          <tbody>
            {omcMembers.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No OMC members with their own login yet.</td></tr>
            )}
            {omcMembers.map((m) => (
              <tr key={m.id}><td>{m.username}</td><td>{m.name}</td><td>{m.email}</td><td>{m.organization ? `Industry — ${m.organization}` : "Industry / external"}</td></tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Faculty members on the OMC ({facultyOmc.length})</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {facultyOmc.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No faculty member is on the OMC yet.</td></tr>}
            {facultyOmc.map((f) => <tr key={f.id}><td>{f.name}</td><td>{f.email}</td><td><OmcHatButton userId={f.id} name={f.name} /></td></tr>)}
          </tbody>
        </table>
        <div style={{ marginTop: 14 }}>
          <b style={{ fontSize: 13 }}>Add a faculty member to the OMC</b>
          <GiveRole roles={["OMC"]} teachers={candidates.map((c) => ({ id: c.id, name: c.name + (c.role === "SUBJECT_EXPERT" ? " (Subject Expert)" : "") }))} />
        </div>
      </div>

      <CreateUserForm endpoint="/api/chairman/omc" buttonLabel="Create OMC Member (industry / external)" showOrganization />
    </Shell>
  );
}
