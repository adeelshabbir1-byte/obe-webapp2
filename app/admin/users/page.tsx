import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";

export default async function AdminUsersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const chairmen = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, orderBy: { createdAt: "desc" } });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={[{ href: "/admin/users", label: "Manage Chairmen" }, { href: "/admin/curricula", label: "Master Curricula" }, { href: "/admin/curriculum-migration", label: "Version Migration" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Manage Chairmen</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Create the Chairman account(s) who each run a department's accreditation pipeline.
      </p>

      <div className="card">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Department</th></tr></thead>
          <tbody>
            {chairmen.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No Chairman accounts yet.</td></tr>
            )}
            {chairmen.map((c) => (
              <tr key={c.id}><td>{c.username}</td><td>{c.name}</td><td>{c.email}</td><td>{c.department || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserForm endpoint="/api/admin/users" buttonLabel="Create Chairman" />
    </Shell>
  );
}
