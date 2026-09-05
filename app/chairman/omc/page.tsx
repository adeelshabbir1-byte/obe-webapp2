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

export default async function ChairmanOmcPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const omcMembers = await prisma.user.findMany({ where: { role: "OMC", managedById: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OMC Members</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        The Outcome Management Committee reviews and approves Subject Expert course templates.
      </p>

      <div className="card">
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            {omcMembers.length === 0 && (
              <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No OMC members yet.</td></tr>
            )}
            {omcMembers.map((m) => (
              <tr key={m.id}><td>{m.username}</td><td>{m.name}</td><td>{m.email}</td></tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <CreateUserForm endpoint="/api/chairman/omc" buttonLabel="Create OMC Member" />
    </Shell>
  );
}
