import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import { getPolicyForCourse } from "../../../../../lib/weightPolicy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorWeightsForm from "../../../../../components/InstructorWeightsForm";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function InstructorWeightsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);
  const updated = await prisma.course.findUnique({ where: { id: course.id } });
  if (!updated) notFound();

  const policy = await getPolicyForCourse(course.coordinator.managedById, course.courseType);

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={updated.id} active="weights" code={updated.code} title={updated.title} />
      <InstructorWeightsForm
        courseId={updated.id}
        current={{
          assignmentPct: updated.instructorAssignmentPct ?? updated.assignmentPct, quizPct: updated.instructorQuizPct ?? updated.quizPct,
          projectPct: updated.instructorProjectPct ?? updated.projectPct, labPct: updated.instructorLabPct ?? updated.labPct,
          midtermPct: updated.instructorMidtermPct ?? updated.midtermPct, finalPct: updated.instructorFinalPct ?? updated.finalPct,
        }}
        sePlanned={{ assignmentPct: updated.assignmentPct, quizPct: updated.quizPct, projectPct: updated.projectPct, labPct: updated.labPct, midtermPct: updated.midtermPct, finalPct: updated.finalPct }}
        policy={policy ? {
          assignmentMin: policy.assignmentMin, assignmentMax: policy.assignmentMax,
          quizMin: policy.quizMin, quizMax: policy.quizMax,
          projectMin: policy.projectMin, projectMax: policy.projectMax,
          labMin: policy.labMin, labMax: policy.labMax,
          midtermMin: policy.midtermMin, midtermMax: policy.midtermMax,
          finalMin: policy.finalMin, finalMax: policy.finalMax,
        } : null}
      />
    </Shell>
  );
}
