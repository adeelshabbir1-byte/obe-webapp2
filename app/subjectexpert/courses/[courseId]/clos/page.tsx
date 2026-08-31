import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import ClosManager from "../../../../../components/ClosManager";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function ClosPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { clos: { orderBy: { code: "asc" } } },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  // PLOs are restricted to only what OMC has assigned to THIS course via
  // the PLO–Course matrix — not the full list of the program's PLOs.
  const mappings = await prisma.coursePloMapping.findMany({
    where: { courseId: course.id },
    include: { plo: true },
    orderBy: { plo: { number: "asc" } },
  });
  const plos = mappings.map((m) => m.plo);

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} status={course.templateStatus} />
      <ClosManager
        courseId={course.id}
        initialClos={course.clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId }))}
        plos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status }))}
      />
    </Shell>
  );
}
