import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorInstrumentsManager from "../../../../../components/InstructorInstrumentsManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }];

export default async function InstructorInstrumentsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);
  const updated = await prisma.course.findUnique({ where: { id: course.id }, include: { assessmentInstruments: { where: { source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] } } });
  if (!updated) notFound();

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={updated.id} active="instruments" code={updated.code} title={updated.title} />
      <InstructorInstrumentsManager
        courseId={updated.id}
        initialInstruments={updated.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct }))}
        targets={{
          assignmentPct: updated.instructorAssignmentPct ?? updated.assignmentPct, quizPct: updated.instructorQuizPct ?? updated.quizPct,
          midtermPct: updated.instructorMidtermPct ?? updated.midtermPct, finalPct: updated.instructorFinalPct ?? updated.finalPct,
          projectPct: updated.instructorProjectPct ?? updated.projectPct, labPct: updated.instructorLabPct ?? updated.labPct,
        }}
      />
    </Shell>
  );
}
