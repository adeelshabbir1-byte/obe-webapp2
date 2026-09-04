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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, width: "26%", verticalAlign: "top", background: "var(--paper)" }}>{label}</td>
      <td>{value}</td>
    </tr>
  );
}

export default async function CourseDescriptionPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({
    where: { ...courseScopeFor(user) },
    include: { batch: true, subjectExpert: true },
    orderBy: { code: "asc" },
  });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

    const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = selectedCourseId
    ? await prisma.course.findUnique({
        where: { id: selectedCourseId },
        include: { batch: true, subjectExpert: true, clos: { where: { source: "SE" }, orderBy: { code: "asc" } }, lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" } } },
      })
    : null;

  const byWeek = new Map<number, string[]>();
  if (course) for (const r of course.lectureRows) byWeek.set(r.week, [...(byWeek.get(r.week) || []), r.topic]);

  // Prefer the Instructor's current weights (their actual delivered numbers)
  // over the SE's original plan, once the Instructor has set their own.
  const liveWeights = course ? {
    assignmentPct: course.instructorAssignmentPct ?? course.assignmentPct,
    quizPct: course.instructorQuizPct ?? course.quizPct,
    projectPct: course.instructorProjectPct ?? course.projectPct,
    labPct: course.instructorLabPct ?? course.labPct,
    midtermPct: course.instructorMidtermPct ?? course.midtermPct,
    finalPct: course.instructorFinalPct ?? course.finalPct,
    isInstructorSet: course.instructorAssignmentPct !== null,
  } : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Course Description Form" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        {selectedCourseId && <a href={`/api/reports/course-description-word?courseId=${selectedCourseId}`} className="btn btn-brass" style={{ textDecoration: "none", marginLeft: 10 }}>Download Word</a>}
        </div>
      </div>
      {course && (
        <div className="card">
          <SortableTable>
            <tbody>
              <Row label="Degree Program" value={course.batch?.degreeProgram || "—"} />
              <Row label="Course Code" value={course.code} />
              <Row label="Course Title" value={course.title} />
              <Row label="Credit Hours" value={course.creditHours} />
              <Row label="Assessment Instruments with Weights" value={
                <>
                  <SortableTable style={{ marginTop: 0 }}>
                    <tbody>
                      <tr><td>Assignment</td><td>{liveWeights!.assignmentPct}</td></tr>
                      <tr><td>Quiz</td><td>{liveWeights!.quizPct}</td></tr>
                      <tr><td>Project</td><td>{liveWeights!.projectPct}</td></tr>
                      <tr><td>Lab</td><td>{liveWeights!.labPct}</td></tr>
                      <tr><td>Midterm</td><td>{liveWeights!.midtermPct}</td></tr>
                      <tr><td>Final</td><td>{liveWeights!.finalPct}</td></tr>
                      <tr style={{ fontWeight: 700 }}><td>Total</td><td>{liveWeights!.assignmentPct + liveWeights!.quizPct + liveWeights!.projectPct + liveWeights!.labPct + liveWeights!.midtermPct + liveWeights!.finalPct}</td></tr>
                    </tbody>
                  </SortableTable>
                  <p style={{ fontSize: 10.5, color: "var(--slate)", marginTop: 4 }}>
                    {liveWeights!.isInstructorSet ? "Instructor's current delivered weights." : "Subject Expert's planned weights (Instructor hasn't set their own yet)."}
                  </p>
                </>
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
                <SortableTable style={{ marginTop: 0 }}>
                  <thead><tr><th>Week</th><th>Topics</th><th>No. of Lectures</th></tr></thead>
                  <tbody>
                    {Array.from(byWeek.entries()).map(([week, topics]) => (
                      <tr key={week}><td>{week}</td><td>{topics.join("; ")}</td><td>{topics.length}</td></tr>
                    ))}
                  </tbody>
                </SortableTable>
              } />
              <Row label="Programming Assignments" value={course.programmingAssignmentsNote || <span style={{ color: "var(--slate)" }}>Not filled in yet.</span>} />
            </tbody>
          </SortableTable>
        </div>
      )}
    </Shell>
  );
}
