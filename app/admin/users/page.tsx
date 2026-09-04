import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateUserForm from "../../../components/CreateUserForm";
import ChairmenBrandingManager from "../../../components/ChairmenBrandingManager";

export default async function AdminUsersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const chairmen = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, orderBy: { createdAt: "desc" } });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={[{ href: "/admin/users", label: "Manage Chairmen" }, { href: "/admin/curricula", label: "Master Curricula" }, { href: "/admin/curriculum-migration", label: "Version Migration" }, { href: "/admin/platform-settings", label: "Platform Settings" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Manage Chairmen</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Create the Chairman account(s) who each run a department's accreditation pipeline. Each is its own
        paying tenant — set their institute name and logo here; they can't change it themselves.
      </p>

      <div className="card">
        <ChairmenBrandingManager
          chairmen={chairmen.map((c) => ({
            id: c.id, username: c.username, name: c.name, email: c.email, department: c.department,
            instituteName: c.instituteName, instituteLogo: c.instituteLogo,
          }))}
        />
      </div>

      <CreateUserForm endpoint="/api/admin/users" buttonLabel="Create Chairman" />
    </Shell>
  );
}
