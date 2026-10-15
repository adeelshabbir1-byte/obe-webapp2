import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import CourseResourcesSection from "../../../../../components/CourseResourcesSection";
import { navForRole } from "../../../../../components/reportNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tools & Books" };

// The software, languages and tools the teacher uses in this course, and its textbooks (the library orders from these).
export default async function InstructorResourcesPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="resources" code={course.code} title={course.title} />
      <CourseResourcesSection courseId={course.id} user={user} />
    </Shell>
  );
}
