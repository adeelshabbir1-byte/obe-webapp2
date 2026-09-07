import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorLectureContentManager from "../../../../../components/InstructorLectureContentManager";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function InstructorSchedulePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);

  const [instructorRows, seRows, clos, holidays, seClos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { code: "asc" } }),
    prisma.holiday.findMany({ where: { coordinatorId: course.coordinatorId } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" } }),
  ]);
  const seCloCodeById = new Map(seClos.map((c) => [c.id, c.code]));
  const seTopicByLecture = new Map(seRows.map((r) => [r.lectureNumber, r.topic]));
  const seRowByLecture = new Map(seRows.map((r) => [r.lectureNumber, {
    topic: r.topic, subtopic: r.subtopic, cloCode: r.cloId ? seCloCodeById.get(r.cloId) || null : null,
    bloomLevel: r.bloomLevel, weightPct: r.weightPct, week: r.week,
  }]));
  const holidayLabelByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.label]));

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="schedule" code={course.code} title={course.title} />
      <InstructorLectureContentManager
        courseId={course.id}
        initialRows={instructorRows.map((r) => {
          const cloCode = r.cloId ? clos.find((c) => c.id === r.cloId)?.code || null : null;
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
            cloId: r.cloId, cloCode, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
            actualDate: r.actualDate ? r.actualDate.toISOString() : null,
            seTopic: seTopicByLecture.get(r.lectureNumber) || "",
            rescheduledNote: r.rescheduledNote,
            holidayConflict: r.actualDate ? holidayLabelByDate.get(r.actualDate.toISOString().slice(0, 10)) || null : null,
          };
        })}
        sePlan={Array.from(seRowByLecture.entries()).sort((a, b) => a[0] - b[0]).map(([lectureNumber, r]) => ({ lectureNumber, ...r }))}
        clos={clos.map((c) => ({ id: c.id, code: c.code }))}
      />
    </Shell>
  );
}
