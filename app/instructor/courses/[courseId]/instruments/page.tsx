import { redirect, notFound } from "next/navigation";
import { closWithPlo } from "../../../../../lib/assessmentWeights";
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
import { navForRole } from "../../../../../components/reportNav";
import { recomputeCourseRows } from "../../../../../lib/lectureWeights";


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

  // Self-heal: recompute every row's weight before reading it, so a row
  // left with a stale number from before a weight-logic fix corrects
  // itself the moment the page is opened, with no manual step by anyone.
  await recomputeCourseRows(course.id, "INSTRUCTOR");

  const updated = await prisma.course.findUnique({
    where: { id: course.id },
    include: {
      assessmentInstruments: { where: { source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }], include: { evidence: { orderBy: { createdAt: "desc" } } } },
      lectureRows: { where: { source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, include: { instrumentLinks: true } },
      clos: { where: { source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" } },
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
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={updated.id} active="instruments" code={updated.code} title={updated.title} />

      <AssessmentsManager
        counts={{ Quiz: (course as unknown as { quizCount: number | null }).quizCount, Assignment: (course as unknown as { assignmentCount: number | null }).assignmentCount }}
        bestOf={{ Quiz: (course as unknown as { quizBestOf: number | null }).quizBestOf, Assignment: (course as unknown as { assignmentBestOf: number | null }).assignmentBestOf }}
        courseId={updated.id}
        initialInstruments={updated.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore, evidence: i.evidence.map((e) => ({ id: e.id, fileName: e.fileName, fileUrl: e.fileUrl, status: e.status, method: e.method, reasoning: e.reasoning })) }))}
        targets={{
          assignmentPct: updated.instructorAssignmentPct ?? updated.assignmentPct, quizPct: updated.instructorQuizPct ?? updated.quizPct,
          midtermPct: updated.instructorMidtermPct ?? updated.midtermPct, finalPct: updated.instructorFinalPct ?? updated.finalPct,
          projectPct: updated.instructorProjectPct ?? updated.projectPct, labPct: updated.instructorLabPct ?? updated.labPct,
        }}
        policyMax={policy ? {
          assignmentMax: policy.assignmentMax, quizMax: policy.quizMax, midtermMax: policy.midtermMax,
          finalMax: policy.finalMax, projectMax: policy.projectMax, labMax: policy.labMax,
        } : undefined}
        policyMinCount={policy ? {
          assignmentMinCount: policy.assignmentMinCount, quizMinCount: policy.quizMinCount, midtermMinCount: policy.midtermMinCount,
          finalMinCount: policy.finalMinCount, projectMinCount: policy.projectMinCount, labMinCount: policy.labMinCount,
        } : undefined}
        rows={updated.lectureRows.map((r) => {
          const linkedInstruments = r.instrumentLinks
            .map((l) => updated.assessmentInstruments.find((i) => i.id === l.instrumentId))
            .filter((i): i is (typeof updated.assessmentInstruments)[number] => !!i);
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
            linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
            midtermQuestions: linkedInstruments.filter((i) => i.type === "Midterm").map((i) => i.label).join(", "),
            finalQuestions: linkedInstruments.filter((i) => i.type === "Final").map((i) => i.label).join(", "),
            weightPct: r.weightPct,
            cloId: r.cloId,
          };
        })}
        clos={await closWithPlo(updated.clos.map((c) => ({ id: c.id, code: c.code, mappedPloId: c.mappedPloId })))}
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
