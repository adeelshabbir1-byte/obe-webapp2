import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, width: "26%", verticalAlign: "top", background: "var(--paper)" }}>{label}</td>
      <td>{value}</td>
    </tr>
  );
}

export default async function CourseDescriptionPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { batch: true, subjectExpert: true },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = selectedCourseId
    ? await prisma.course.findUnique({
        where: { id: selectedCourseId },
        include: { batch: true, subjectExpert: true, clos: { where: { source: "SE" }, orderBy: { code: "asc" } }, lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" } } },
      })
    : null;

  const byWeek = new Map<number, string[]>();
  if (course) for (const r of course.lectureRows) byWeek.set(r.week, [...(byWeek.get(r.week) || []), r.topic]);

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Course Description Form" />
      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
      </div>
      {course && (
        <div className="card">
          <table>
            <tbody>
              <Row label="Degree Program" value={course.batch?.degreeProgram || "—"} />
              <Row label="Course Code" value={course.code} />
              <Row label="Course Title" value={course.title} />
              <Row label="Credit Hours" value={course.creditHours} />
              <Row label="Assessment Instruments with Weights" value={
                <table style={{ marginTop: 0 }}>
                  <tbody>
                    <tr><td>Assignment</td><td>{course.assignmentPct}</td></tr>
                    <tr><td>Quiz</td><td>{course.quizPct}</td></tr>
                    <tr><td>Project</td><td>{course.projectPct}</td></tr>
                    <tr><td>Lab</td><td>{course.labPct}</td></tr>
                    <tr><td>Midterm</td><td>{course.midtermPct}</td></tr>
                    <tr><td>Final</td><td>{course.finalPct}</td></tr>
                    <tr style={{ fontWeight: 700 }}><td>Total</td><td>{course.assignmentPct + course.quizPct + course.projectPct + course.labPct + course.midtermPct + course.finalPct}</td></tr>
                  </tbody>
                </table>
              } />
              <Row label="Course Instructor" value={course.subjectExpert?.name || "—"} />
              <Row label="Lab Instructor" value={course.labInstructorName || "N/A"} />
              <Row label="Current Catalog Description" value={course.catalogDescription || <span style={{ color: "var(--slate)" }}>Not filled in yet.</span>} />
              <Row label="Textbook" value={course.textbook || <span style={{ color: "var(--slate)" }}>Not filled in yet.</span>} />
              <Row label="Reference Material" value={course.referenceMaterial || <span style={{ color: "var(--slate)" }}>Not filled in yet.</span>} />
              <Row label="Course Learning Outcomes" value={
                <ol style={{ margin: 0, paddingLeft: 18 }}>{course.clos.map((c) => <li key={c.id} style={{ marginBottom: 4 }}>{c.statement}</li>)}</ol>
              } />
              <Row label="Topics Covered, by Week" value={
                <table style={{ marginTop: 0 }}>
                  <thead><tr><th>Week</th><th>Topics</th><th>No. of Lectures</th></tr></thead>
                  <tbody>
                    {Array.from(byWeek.entries()).map(([week, topics]) => (
                      <tr key={week}><td>{week}</td><td>{topics.join("; ")}</td><td>{topics.length}</td></tr>
                    ))}
                  </tbody>
                </table>
              } />
              <Row label="Programming Assignments" value={course.programmingAssignmentsNote || <span style={{ color: "var(--slate)" }}>Not filled in yet.</span>} />
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
