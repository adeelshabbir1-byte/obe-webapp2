import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import WeightsForm from "../../../../../components/WeightsForm";
import SubmitTemplateButton from "../../../../../components/SubmitTemplateButton";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function WeightsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const clos = await prisma.cLO.findMany({ where: { courseId: course.id } });
  const lectureRows = await prisma.lectureRow.findMany({ where: { courseId: course.id } });
  const hitCounts: Record<string, number> = {};
  for (const c of clos) hitCounts[c.id] = 0;
  for (const r of lectureRows) if (r.cloId) hitCounts[r.cloId] = (hitCounts[r.cloId] || 0) + 1;
  const underCovered = clos.filter((c) => (hitCounts[c.id] || 0) < 3);
  const canSubmit = clos.length > 0 && lectureRows.length > 0 && underCovered.length === 0;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="weights" code={course.code} title={course.title} status={course.templateStatus} />

      {course.templateStatus === "changes-requested" && course.omcComment && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Changes Requested by OMC</h3>
          <p style={{ fontSize: 12.5 }}>{course.omcComment}</p>
        </div>
      )}
      {course.templateStatus === "approved" && (
        <div className="card" style={{ borderColor: "var(--sage)" }}>
          <h3 style={{ fontSize: 14, color: "var(--sage)" }}>Approved by OMC</h3>
          {course.omcComment && <p style={{ fontSize: 12.5, marginTop: 6 }}>{course.omcComment}</p>}
        </div>
      )}

      <WeightsForm
        courseId={course.id}
        current={{
          assignmentPct: course.assignmentPct, quizPct: course.quizPct, projectPct: course.projectPct,
          labPct: course.labPct, midtermPct: course.midtermPct, finalPct: course.finalPct,
        }}
      />

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Ready to submit?</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          {clos.length} CLO(s), {lectureRows.length} lecture row(s). Once submitted, the OMC will review this template.
        </p>
        {underCovered.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 12 }}>
            Not ready yet — these CLOs need at least 3 lecture topics each: {underCovered.map((c) => c.code).join(", ")}
            (see the 30-Lecture Schedule tab).
          </p>
        )}
        <SubmitTemplateButton courseId={course.id} disabled={!canSubmit || course.templateStatus === "submitted" || course.templateStatus === "approved"} />
      </div>
    </Shell>
  );
}
