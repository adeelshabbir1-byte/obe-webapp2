import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorLectureContentManager from "../../../../../components/InstructorLectureContentManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }];

export default async function InstructorSchedulePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);

  const [instructorRows, seRows, clos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { code: "asc" } }),
  ]);
  const seTopicByLecture = new Map(seRows.map((r) => [r.lectureNumber, r.topic]));

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="schedule" code={course.code} title={course.title} />
      <InstructorLectureContentManager
        courseId={course.id}
        initialRows={instructorRows.map((r) => ({
          id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
          cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
          actualDate: r.actualDate ? r.actualDate.toISOString() : null,
          seTopic: seTopicByLecture.get(r.lectureNumber) || "",
        }))}
        clos={clos.map((c) => ({ id: c.id, code: c.code }))}
      />
    </Shell>
  );
}
