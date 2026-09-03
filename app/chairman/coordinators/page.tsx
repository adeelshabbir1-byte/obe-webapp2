import { redirect } from "next/navigation";
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

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={[{ href: "/chairman/coordinators", label: "Program Coordinators" }, { href: "/chairman/plos", label: "Program Learning Outcomes" }, { href: "/chairman/omc", label: "OMC Members" }, { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/cqi", label: "CQI Records" }, { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/omc/reports", label: "Reports" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Coordinators</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Coordinators onboard faculty and define courses on your behalf.
      </p>

      <div className="card">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            {coordinators.length === 0 && (
              <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No coordinators yet.</td></tr>
            )}
            {coordinators.map((c) => (
              <tr key={c.id}><td>{c.username}</td><td>{c.name}</td><td>{c.email}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserForm endpoint="/api/chairman/coordinators" buttonLabel="Create Coordinator" />
    </Shell>
  );
}
