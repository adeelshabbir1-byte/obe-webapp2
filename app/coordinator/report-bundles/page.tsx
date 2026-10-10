import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { ALL_REPORTS, NCEAC_PACKAGE_REPORT_HREFS, reportIdForHref } from "../../../lib/reportRegistry";
import Shell from "../../../components/Shell";
import ReportBundleManager from "../../../components/ReportBundleManager";
import NceacPackageButton from "../../../components/NceacPackageButton";
import { navForRole } from "../../../components/reportNav";


export default async function CoordinatorReportBundlesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [own, platform] = await Promise.all([
    prisma.reportBundle.findMany({ where: { scope: "COORDINATOR", ownerId: user.id } }),
    prisma.reportBundle.findMany({ where: { scope: "PLATFORM" } }),
  ]);

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Report Bundles</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Group reports together for one-go printing — like a full "NCEAC Visit Package."
      </p>
      <NceacPackageButton
        apiEndpoint="/api/coordinator/report-bundles"
        reportIds={NCEAC_PACKAGE_REPORT_HREFS.map(reportIdForHref)}
        alreadyExists={own.some((b) => b.name === "NCEAC Accreditation Package")}
      />
      <ReportBundleManager
        apiEndpoint="/api/coordinator/report-bundles"
        reports={ALL_REPORTS}
        bundles={own.map((b) => ({ id: b.id, name: b.name, description: b.description, reportIds: JSON.parse(b.reportIds) }))}
        extraBundles={platform.map((b) => ({ id: b.id, name: b.name, description: b.description, reportIds: JSON.parse(b.reportIds) }))}
        extraLabel="Platform-Wide Bundles (from Super Admin)"
        readOnlyExtra={true}
      />
    </Shell>
  );
}
