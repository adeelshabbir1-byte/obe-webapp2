import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import InstrumentsManager from "../../../../../components/InstrumentsManager";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function InstrumentsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { assessmentInstruments: { orderBy: [{ type: "asc" }, { label: "asc" }] } },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="instruments" code={course.code} title={course.title} status={course.templateStatus} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Define each individual quiz, assignment, and midterm/final question with its own % of the total course marks.
        On the Lecture Schedule tab, you'll check off which of these each lecture's topic is tested in.
      </p>
      <InstrumentsManager
        courseId={course.id}
        initialInstruments={course.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct }))}
        targets={{
          assignmentPct: course.assignmentPct, quizPct: course.quizPct, midtermPct: course.midtermPct,
          finalPct: course.finalPct, projectPct: course.projectPct, labPct: course.labPct,
        }}
      />
    </Shell>
  );
}
