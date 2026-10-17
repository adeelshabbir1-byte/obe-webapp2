import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import WorkSamples from "../../../../../components/WorkSamples";
import { navForRole } from "../../../../../components/reportNav";
import { courseSampling } from "../../../../../lib/portfolio";

export const dynamic = "force-dynamic";

export default async function SamplesPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  const data = await courseSampling(course.id);
  return (
    <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="samples" code={course.code} title={course.title} />
      {data.ready ? <WorkSamples courseId={course.id} items={JSON.parse(JSON.stringify(data.items))} students={data.students} /> : <div className="err">Work samples are not set up yet — run prisma/migration_portfolio.sql.</div>}
    </Shell>
  );
}
