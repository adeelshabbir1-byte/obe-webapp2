import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import CourseFlowPanel from "../../../../../components/CourseFlowPanel";
import { navForRole } from "../../../../../components/reportNav";

export const dynamic = "force-dynamic";

export default async function SeFlowPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, templateStatus: true, subjectExpertId: true } });
  if (!course || course.subjectExpertId !== user.id) notFound();
  return (
    <Shell roleLabel="University Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="flow" code={course.code} title={course.title} status={course.templateStatus} />
      <CourseFlowPanel courseId={course.id} source="SE" />
    </Shell>
  );
}
