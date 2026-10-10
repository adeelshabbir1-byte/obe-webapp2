import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import TemplateChangeHistory from "../../../../../components/TemplateChangeHistory";
import { loadChangeItems } from "../../../../../lib/templateChangeItems";

export default async function ChangeHistoryPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.subjectExpertId !== user.id) notFound();
  const items = await loadChangeItems({ courseId: course.id });
  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} status={course.templateStatus} />
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Change history</h2>
      <TemplateChangeHistory items={items} showCourse={false} />
    </Shell>
  );
}
