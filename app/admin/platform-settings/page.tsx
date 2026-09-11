import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PlatformSettingsForm from "../../../components/PlatformSettingsForm";

const NAV = [
  { href: "/admin/users", label: "Chairman Accounts" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function PlatformSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Platform Settings</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Institute name and logos shown across every page and report. Only you can change these.
      </p>
      <PlatformSettingsForm
        initial={{ ownerLogo: settings?.ownerLogo || null, nceacLogo: settings?.nceacLogo || null }}
      />
    </Shell>
  );
}
