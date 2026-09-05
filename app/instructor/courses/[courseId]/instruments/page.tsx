import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { ensureInstructorCopy } from "../../../../../lib/instructorCopy";
import { suggestClOReweighting } from "../../../../../lib/resultMate";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import AssessmentsManager from "../../../../../components/AssessmentsManager";
import ReweightingSuggestions from "../../../../../components/ReweightingSuggestions";
import FeedForwardNotes from "../../../../../components/FeedForwardNotes";
import GuidanceThread from "../../../../../components/GuidanceThread";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function InstructorInstrumentsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.instructorId !== user.id) notFound();

  const policy = await prisma.weightPolicy.findUnique({
    where: { chairmanId_courseType: { chairmanId: course.coordinator.managedById || "", courseType: course.courseType } },
  });

  await ensureInstructorCopy(course.id);
  const updated = await prisma.course.findUnique({
    where: { id: course.id },
    include: {
      assessmentInstruments: { where: { source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] },
      lectureRows: { where: { source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, include: { instrumentLinks: true } },
    },
  });
  if (!updated) notFound();

  const [guidance, prereqNotes, myNotes] = await Promise.all([
    prisma.instructorGuidanceComment.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } }),
    (async () => {
      const relevantIds = [course.prerequisiteCourseId, course.benchmarkSourceId].filter((id): id is string => !!id);
      if (relevantIds.length === 0) return [];
      return prisma.feedForwardNote.findMany({ where: { courseId: { in: relevantIds } }, include: { course: true }, orderBy: { createdAt: "desc" } });
    })(),
    prisma.feedForwardNote.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const reweightingSuggestions = await suggestClOReweighting(course.id);

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={NAV}>
      <InstructorCourseSubNav courseId={updated.id} active="instruments" code={updated.code} title={updated.title} />

      <AssessmentsManager
        courseId={updated.id}
        initialInstruments={updated.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct }))}
        targets={{
          assignmentPct: updated.instructorAssignmentPct ?? updated.assignmentPct, quizPct: updated.instructorQuizPct ?? updated.quizPct,
          midtermPct: updated.instructorMidtermPct ?? updated.midtermPct, finalPct: updated.instructorFinalPct ?? updated.finalPct,
          projectPct: updated.instructorProjectPct ?? updated.projectPct, labPct: updated.instructorLabPct ?? updated.labPct,
        }}
        policyMax={policy ? {
          assignmentMax: policy.assignmentMax, quizMax: policy.quizMax, midtermMax: policy.midtermMax,
          finalMax: policy.finalMax, projectMax: policy.projectMax, labMax: policy.labMax,
        } : undefined}
        rows={updated.lectureRows.map((r) => {
          const linkedInstruments = r.instrumentLinks
            .map((l) => updated.assessmentInstruments.find((i) => i.id === l.instrumentId))
            .filter((i): i is (typeof updated.assessmentInstruments)[number] => !!i);
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic,
            linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
            midtermQuestions: linkedInstruments.filter((i) => i.type === "Midterm").map((i) => i.label).join(", "),
            finalQuestions: linkedInstruments.filter((i) => i.type === "Final").map((i) => i.label).join(", "),
            weightPct: r.weightPct,
          };
        })}
        apiBase="/api/instructor"
      />

      <ReweightingSuggestions courseId={updated.id} suggestions={reweightingSuggestions} />

      <FeedForwardNotes
        courseId={course.id}
        incoming={prereqNotes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), fromCourse: `${n.course.code} — ${n.course.title}` }))}
        myNotes={myNotes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))}
      />

      <GuidanceThread
        courseId={course.id}
        apiBase="/api/instructor"
        initialComments={guidance.map((g) => ({ id: g.id, body: g.body, authorRole: g.authorRole, createdAt: g.createdAt.toISOString() }))}
      />
    </Shell>
  );
}
