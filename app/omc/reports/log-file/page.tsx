import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

export default async function LogFilePage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({ where: { AND: [courseScopeFor(user), { instructorId: { not: null } }] }, include: { batch: true, instructor: true }, orderBy: { code: "asc" } });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

    const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const rows = selectedCourseId
    ? await prisma.lectureRow.findMany({ where: { courseId: selectedCourseId, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, include: { clo: true } })
    : [];
  const dayModes = user.role !== "INSTRUCTOR" && course
    ? await prisma.classDayMode.findMany({ where: { coordinatorId: course.coordinatorId } })
    : [];
  const modeByDate = new Map(dayModes.map((m) => [m.date.toISOString().slice(0, 10), m.mode]));

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Course Log File" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
      </div>
      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Wk</th><th>Lec</th><th>Date</th><th>Mode</th><th>Topic</th><th>Sub Topic</th><th>CLO</th><th>Reschedule Note</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No delivery data logged yet.</td></tr>}
            {rows.map((r) => {
              const dateStr = r.actualDate ? r.actualDate.toISOString().slice(0, 10) : "";
              return (
                <tr key={r.id} style={{ background: r.rescheduledNote ? "#FFE4DC" : undefined }}>
                  <td>{r.week}</td><td>{r.lectureNumber}</td><td>{dateStr || "—"}</td>
                  <td>{dateStr ? (modeByDate.get(dateStr) === "Online" ? "Online" : "On-Campus") : "—"}</td>
                  <td>{r.topic || "—"}</td><td>{r.subtopic || "—"}</td><td>{r.clo?.code || "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--rust)" }}>{r.rescheduledNote || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
