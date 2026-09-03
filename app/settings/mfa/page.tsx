import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import MfaSetupManager from "../../../components/MfaSetupManager";
import { roleLabel } from "../../../lib/reportScope";

export default async function MfaSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={[{ href: "/dashboard", label: "Back to Dashboard" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Security Settings</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Manage two-factor authentication for your account.</p>
      <MfaSetupManager mfaEnabled={fullUser?.mfaEnabled || false} />
    </Shell>
  );
}
