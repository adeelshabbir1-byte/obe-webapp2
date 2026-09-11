import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { ALL_REPORTS } from "../../../lib/reportRegistry";
import Shell from "../../../components/Shell";
import ReportBundleManager from "../../../components/ReportBundleManager";

const NAV = [
  { href: "/admin/users", label: "Chairman Accounts" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function AdminReportBundlesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const bundles = await prisma.reportBundle.findMany({ where: { scope: "PLATFORM" } });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Report Bundles</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Platform-wide report groups — available to every institution for one-go printing.
      </p>
      <ReportBundleManager
        apiEndpoint="/api/admin/report-bundles"
        reports={ALL_REPORTS}
        bundles={bundles.map((b) => ({ id: b.id, name: b.name, description: b.description, reportIds: JSON.parse(b.reportIds) }))}
      />
    </Shell>
  );
}
