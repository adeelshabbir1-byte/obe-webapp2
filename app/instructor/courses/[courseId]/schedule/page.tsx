import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import InstructorLectureScheduleManager from "../../../../../components/InstructorLectureScheduleManager";
import FeedForwardNotes from "../../../../../components/FeedForwardNotes";
import GuidanceThread from "../../../../../components/GuidanceThread";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }];

export default async function InstructorSchedulePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  await ensureInstructorCopy(course.id);

  const [instructorRows, seRows, clos, instruments, guidance, prereqNotes, myNotes] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, include: { clo: true, instrumentLinks: true } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { code: "asc" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.instructorGuidanceComment.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    (async () => {
      const relevantIds = [course.prerequisiteCourseId, course.benchmarkSourceId].filter((id): id is string => !!id);
      if (relevantIds.length === 0) return [];
      return prisma.feedForwardNote.findMany({ where: { courseId: { in: relevantIds } }, include: { course: true }, orderBy: { createdAt: "desc" } });
    })(),
    prisma.feedForwardNote.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const seTopicByLecture = new Map(seRows.map((r) => [r.lectureNumber, r.topic]));

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={course.id} active="schedule" code={course.code} title={course.title} />

      <FeedForwardNotes
        courseId={course.id}
        incoming={prereqNotes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), fromCourse: `${n.course.code} — ${n.course.title}` }))}
        myNotes={myNotes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))}
      />

      <InstructorLectureScheduleManager
        courseId={course.id}
        initialRows={instructorRows.map((r) => {
          const linkedInstruments = r.instrumentLinks
            .map((l) => instruments.find((i) => i.id === l.instrumentId))
            .filter((i): i is (typeof instruments)[number] => !!i);
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
            cloId: r.cloId, cloCode: r.clo?.code || null, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
            linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
            midtermQuestions: linkedInstruments.filter((i) => i.type === "Midterm").map((i) => i.label).join(", "),
            finalQuestions: linkedInstruments.filter((i) => i.type === "Final").map((i) => i.label).join(", "),
            actualDate: r.actualDate ? r.actualDate.toISOString() : null,
            seTopic: seTopicByLecture.get(r.lectureNumber) || "",
          };
        })}
        clos={clos.map((c) => ({ id: c.id, code: c.code }))}
        instruments={instruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct }))}
      />

      <GuidanceThread
        courseId={course.id}
        apiBase="/api/instructor"
        initialComments={guidance.map((g) => ({ id: g.id, body: g.body, authorRole: g.authorRole, createdAt: g.createdAt.toISOString() }))}
      />
    </Shell>
  );
}
