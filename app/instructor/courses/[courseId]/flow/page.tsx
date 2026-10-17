import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import CourseFlowPanel from "../../../../../components/CourseFlowPanel";
import { navForRole } from "../../../../../components/reportNav";

export const dynamic = "force-dynamic";

export default async function InstructorFlowPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  await ensureInstructorCopy(course.id);
  return (
    <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="flow" code={course.code} title={course.title} />
      <CourseFlowPanel courseId={course.id} source="INSTRUCTOR" />
    </Shell>
  );
}
