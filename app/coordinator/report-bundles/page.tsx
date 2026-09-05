import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { ALL_REPORTS } from "../../../lib/reportRegistry";
import Shell from "../../../components/Shell";
import ReportBundleManager from "../../../components/ReportBundleManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

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
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Report Bundles</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Group reports together for one-go printing — like a full "NCEAC Visit Package."
      </p>
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
