import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeTopicVariance } from "../../../../lib/varianceReport";
import Shell from "../../../../components/Shell";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";

export default async function CourseMonitoringPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } },
    include: { batch: true, instructor: true, subjectExpert: true },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const variance = selectedCourseId ? await computeTopicVariance(selectedCourseId) : null;
  const totalPlos = course ? await prisma.pLO.count({ where: { batchId: course.batchId || "" } }) : 0;
  const mappedPlos = course ? await prisma.coursePloMapping.count({ where: { courseId: course.id } }) : 0;
  const liveWeights = course ? {
    assignmentPct: course.instructorAssignmentPct ?? course.assignmentPct,
    quizPct: course.instructorQuizPct ?? course.quizPct,
    projectPct: course.instructorProjectPct ?? course.projectPct,
    labPct: course.instructorLabPct ?? course.labPct,
    midtermPct: course.instructorMidtermPct ?? course.midtermPct,
    finalPct: course.instructorFinalPct ?? course.finalPct,
  } : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Course Monitoring Process Form" />
      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        {selectedCourseId && <a href={`/api/reports/course-monitoring-word?courseId=${selectedCourseId}`} className="btn btn-brass" style={{ textDecoration: "none", marginLeft: 10 }}>Download Word</a>}
      </div>
      {course && variance && (
        <>
          <div className="card">
            <table>
              <tbody>
                <tr><td style={{ fontWeight: 600, width: "26%" }}>Course</td><td>{course.code} — {course.title}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Batch</td><td>{course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—"}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Subject Expert</td><td>{course.subjectExpert?.name || "—"}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Instructor</td><td>{course.instructor?.name || "—"}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>PLOs Assigned to this Course</td><td>{mappedPlos} of {totalPlos} program PLOs</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Assessment Weightage</h3>
            <table>
              <thead><tr><th>Assignment</th><th>Quiz</th><th>Project</th><th>Lab</th><th>Midterm</th><th>Final</th></tr></thead>
              <tbody><tr><td>{liveWeights!.assignmentPct}%</td><td>{liveWeights!.quizPct}%</td><td>{liveWeights!.projectPct}%</td><td>{liveWeights!.labPct}%</td><td>{liveWeights!.midtermPct}%</td><td>{liveWeights!.finalPct}%</td></tr></tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Plan Adherence</h3>
            <p style={{ fontSize: 13 }}>
              Actual delivery covers <b>{variance.adherencePct}%</b> of the Subject Expert's planned weight.
              {variance.missed.length > 0 ? ` ${variance.missed.length} topic(s) not yet covered: ${variance.missed.map((m) => m.topic).join(", ")}.` : " All planned topics covered."}
            </p>
          </div>

          <div className="card no-print" style={{ marginTop: 20 }}>
            <table>
              <tbody>
                <tr><td style={{ width: "50%" }}>Instructor Signature: ___________________________</td><td>Date: ___________________</td></tr>
                <tr><td style={{ paddingTop: 20 }}>Program Coordinator Signature: ___________________________</td><td style={{ paddingTop: 20 }}>Date: ___________________</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
