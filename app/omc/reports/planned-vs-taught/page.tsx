import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor , batchScopeFor, nameCollegeBatches } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import TeachingAnalysisReport from "../../../../components/TeachingAnalysisReport";
import { analyzeTeaching } from "../../../../lib/teachingAnalysis";

export default async function PlannedVsTaughtPage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.planned-vs-taught"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({ where: { AND: [courseScopeFor(user), { instructorId: { not: null } }] }, include: { batch: true, instructor: true }, orderBy: { code: "asc" } });
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds }, ...batchScopeFor(user) }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  await nameCollegeBatches(user, allBatches);
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

  const selectedCourseId = (searchParams.courseId && courses.some((c) => c.id === searchParams.courseId) ? searchParams.courseId : courses[0]?.id) || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const analysis = course ? await analyzeTeaching(course.id) : null;

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Planned vs Taught" />
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
          <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}${c.instructor ? ` (${c.instructor.name})` : ""}` }))} />
        </div>
      </div>
      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}
      {analysis ? <TeachingAnalysisReport a={analysis} heading="How this course was taught compared with the plan" /> : <div className="card"><p style={{ color: "var(--slate)" }}>No course with an Instructor in this selection.</p></div>}
    </Shell>
  );
}
