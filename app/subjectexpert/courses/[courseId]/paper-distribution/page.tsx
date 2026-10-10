import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import PaperDistributionManager from "../../../../../components/PaperDistributionManager";
import { navForRole } from "../../../../../components/reportNav";
import FinalBoundaryPanel from "../../../../../components/FinalBoundaryPanel";
import { computeFinalBoundary } from "../../../../../lib/finalBoundary";


export default async function SePaperDistributionPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const [items, lectureRows, clos] = await Promise.all([
    prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
  ]);

  const coordinator = await prisma.user.findUnique({ where: { id: course.coordinatorId }, select: { managedById: true } });
  const policy = coordinator?.managedById
    ? await prisma.weightPolicy.findUnique({ where: { chairmanId_courseType: { chairmanId: coordinator.managedById, courseType: course.courseType } } })
    : null;
  const boundary = await computeFinalBoundary(course.id, "SE");
  const suggestedBefore = (policy as unknown as { finalBeforeMidtermPct: number | null } | null)?.finalBeforeMidtermPct ?? null;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="paper-distribution" code={course.code} title={course.title} status={course.templateStatus} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Plan the Midterm and Final papers' question distribution. Already set the question numbers against topics
        on the Assessments &amp; Submit tab? Use "Generate from Assessments Tab" below to pull the topic, CLO and
        cognitive level straight from that mapping instead of typing it again — you can still change the cognitive
        level (or anything else) afterwards. Or pick a topic from your lecture plan to auto-fill it, or type a
        custom one by hand. This is your plan; the Instructor keeps their own copy for the actual exam.
      </p>
      {boundary.maxWeek > 0 && (
        <FinalBoundaryPanel courseId={course.id} midtermWeek={boundary.midtermWeek} defaultWeek={boundary.defaultWeek} maxWeek={boundary.maxWeek}
          beforePct={boundary.beforePct} afterPct={boundary.afterPct} unlinked={boundary.unlinked} suggestedBefore={suggestedBefore} />
      )}
      <PaperDistributionManager
        apiBase={`/api/subjectexpert/courses/${course.id}/paper-distribution`}
        items={items.map((i) => ({ id: i.id, examType: i.examType, questionNo: i.questionNo, lectureRowId: i.lectureRowId, topicText: i.topicText, cloId: i.cloId, cognitiveLevel: i.cognitiveLevel, marks: i.marks }))}
        lectureRows={lectureRows.map((r) => ({ id: r.id, topic: r.topic, cloId: r.cloId, bloomLevel: r.bloomLevel }))}
        clos={clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement }))}
        canGenerate
      />
    </Shell>
  );
}
