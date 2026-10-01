import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, chairmanIdFor, roleLabel } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { getTimetableEntries, timeRangeLabel } from "../../../../lib/timetableView";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import TimetableView from "../../../../components/TimetableView";

export default async function InstitutionTimetablePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.timetable"))) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const allEntries = chairmanId ? await getTimetableEntries(chairmanId) : [];
  const entries = allEntries.map((e) => ({ ...e, timeLabel: timeRangeLabel(e.startHour, e.endHour) }));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Institution Timetable" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        The full generated timetable across the institution — filter by Room, Batch, Instructor, or
        Program/Department below.
      </p>
      <TimetableView entries={entries} showFilters />
    </Shell>
  );
}
