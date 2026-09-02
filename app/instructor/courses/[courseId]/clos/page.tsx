import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorClosManager from "../../../../../components/InstructorClosManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }];

export default async function InstructorClosPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);

  const [instructorClos, seClos, mappings] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { code: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { code: "asc" } }),
    prisma.coursePloMapping.findMany({ where: { courseId: course.id }, include: { plo: true }, orderBy: { plo: { number: "asc" } } }),
  ]);
  const plos = mappings.map((m) => m.plo);

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} />
      <InstructorClosManager
        courseId={course.id}
        initialClos={instructorClos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct }))}
        seClos={seClos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct }))}
        plos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status }))}
      />
    </Shell>
  );
}
