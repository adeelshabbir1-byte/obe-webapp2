import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

export default async function WeeklyPlanPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.weekly-plan"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({ where: { ...courseScopeFor(user) }, include: { batch: true, subjectExpert: true }, orderBy: { code: "asc" } });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

    const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const rows = selectedCourseId
    ? await prisma.lectureRow.findMany({ where: { courseId: selectedCourseId, source: "SE" }, orderBy: { lectureNumber: "asc" }, include: { clo: true } })
    : [];

  const byWeek = new Map<number, typeof rows>();
  for (const r of rows) byWeek.set(r.week, [...(byWeek.get(r.week) || []), r]);

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Tentative Weekly Plan" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
      </div>
      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Subject Expert:</b> {course.subjectExpert?.name || "—"} &nbsp; <b>Credit Hours:</b> {course.creditHours}</p>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Week</th><th>Topics</th><th>CLO</th><th>No. of Lectures</th></tr></thead>
          <tbody>
            {byWeek.size === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No lecture content filled in yet.</td></tr>}
            {Array.from(byWeek.entries()).map(([week, wrows]) => (
              <tr key={week}>
                <td style={{ fontWeight: 600 }}>{week}</td>
                <td>{wrows.map((r) => r.topic || "—").join("; ")}</td>
                <td>{Array.from(new Set(wrows.map((r) => r.clo?.code).filter(Boolean))).join(", ") || "—"}</td>
                <td>{wrows.length}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
