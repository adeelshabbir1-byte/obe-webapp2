import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";

const NAV = [
  { href: "/chairman/coordinators", label: "Program Coordinators" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" },
  { href: "/chairman/assigners", label: "Course Assigners" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function ChairmanAssignersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const assigners = await prisma.user.findMany({ where: { role: "COURSE_ASSIGNER", managedById: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Assigners</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Course Assigners build the faculty load matrix — assigning how many sections of each offered course each faculty member teaches.
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

      <CreateUserForm endpoint="/api/chairman/assigners" buttonLabel="Create Course Assigner" />
    </Shell>
  );
}
