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

  const cloCount = await prisma.cLO.count({ where: { courseId: course.id } });
  const lectureCount = await prisma.lectureRow.count({ where: { courseId: course.id } });
  const canSubmit = cloCount > 0 && lectureCount > 0;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="weights" code={course.code} title={course.title} status={course.templateStatus} />

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
          {cloCount} CLO(s), {lectureCount} lecture row(s). Once submitted, the Chairman/OMC will review this template.
        </p>
        <SubmitTemplateButton courseId={course.id} disabled={!canSubmit || course.templateStatus !== "draft"} />
      </div>
    </Shell>
  );
}
