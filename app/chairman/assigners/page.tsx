import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import PeopleTabs from "../../../components/PeopleTabs";
import CreateUserForm from "../../../components/CreateUserForm";
import AssignerHatManager from "../../../components/AssignerHatManager";
import { instituteTerm, termLabel, nextTermLabel, assignerHatActive } from "../../../lib/assignerHat";

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

export default async function ChairmanAssignersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const assigners = await prisma.user.findMany({ where: { role: "COURSE_ASSIGNER", managedById: user.id }, orderBy: { createdAt: "desc" } });

  const [term, people] = await Promise.all([
    instituteTerm(user.id),
    prisma.user.findMany({
      where: { isVisitingPlaceholder: false, isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] }, OR: [{ managedBy: { managedById: user.id } }, { managedById: user.id }] },
      select: { id: true, name: true, assignerTerm: true }, orderBy: { name: "asc" },
    }),
  ]);
  const holders = await Promise.all(people.filter((p) => p.assignerTerm).map(async (p) => ({ id: p.id, name: p.name, term: p.assignerTerm as string, active: await assignerHatActive(p.assignerTerm, user.id) })));

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <PeopleTabs />
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Assigners</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Any teacher can be given this role for a semester, or you can create a separate Course Assigner account. Course Assigners build the faculty load matrix — assigning how many sections of each offered course each faculty member teaches.
      </p>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            {assigners.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No Course Assigners yet.</td></tr>}
            {assigners.map((a) => <tr key={a.id}><td>{a.username}</td><td>{a.name}</td><td>{a.email}</td></tr>)}
          </tbody>
        </SortableTable>
      </div>

      <AssignerHatManager teachers={people.map((p) => ({ id: p.id, name: p.name }))} holders={holders} currentLabel={term ? termLabel(term) : null} nextLabel={term ? nextTermLabel(term) : null} />

      <CreateUserForm endpoint="/api/chairman/assigners" buttonLabel="Create Course Assigner" />
    </Shell>
  );
}
