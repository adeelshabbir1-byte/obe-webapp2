import { redirect, notFound } from "next/navigation";
import { closWithPlo } from "../../../../../lib/assessmentWeights";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import AssessmentsManager from "../../../../../components/AssessmentsManager";
import SubmitTemplateButton from "../../../../../components/SubmitTemplateButton";
import { navForRole } from "../../../../../components/reportNav";
import { recomputeCourseRows } from "../../../../../lib/lectureWeights";


export default async function InstrumentsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  // Self-heal: recompute every row's weight before reading it, so a row
  // left with a stale number from before a weight-logic fix corrects
  // itself the moment the page is opened, with no manual step by anyone.
  await recomputeCourseRows(params.courseId, "SE");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      assessmentInstruments: { where: { source: "SE" }, orderBy: [{ type: "asc" }, { label: "asc" }], include: { evidence: { orderBy: { createdAt: "desc" } } } },
      lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" }, include: { instrumentLinks: true } },
      clos: { where: { source: "SE" }, orderBy: { orderIndex: "asc" } },
      coordinator: true,
    },
  });
  if (!course) notFound();
  if (course.subjectExpertId !== user.id) notFound();

  const reviewer = course.templateReviewedById ? await prisma.user.findUnique({ where: { id: course.templateReviewedById } }) : null;

  const policy = await prisma.weightPolicy.findUnique({
    where: { chairmanId_courseType: { chairmanId: course.coordinator.managedById || "", courseType: course.courseType } },
  });

  // Step 3 (Assessment Weights) has to be completed — category %'s
  // totalling 100% and saved within the OMC's policy range — before quiz/
  // assignment/exam question selection (step 4, below) makes sense: the
  // per-instrument Marks % targets shown on this page come straight from
  // those category %'s, so mapping questions against an unconfirmed or
  // still-pending weight split just produces numbers that have to be
  // redone anyway. weightsConfirmedAt is only set once weights are saved
  // successfully inside the policy range (see the weights route).
  const weightsComplete = !!course.weightsConfirmedAt;
  const pendingException = weightsComplete ? null : await prisma.weightExceptionRequest.findUnique({
    where: { courseId_source: { courseId: course.id, source: "SE" } },
  });

  const cloHitCounts: Record<string, number> = {};
  for (const c of course.clos) cloHitCounts[c.id] = 0;
  for (const r of course.lectureRows) if (r.cloId) cloHitCounts[r.cloId] = (cloHitCounts[r.cloId] || 0) + 1;
  const underCovered = course.clos.filter((c) => (cloHitCounts[c.id] || 0) < 3);

  const byPlo: Record<string, number> = {};
  for (const c of course.clos) {
    if (c.mappedPloId) byPlo[c.mappedPloId] = (byPlo[c.mappedPloId] || 0) + (c.ploContributionPct || 0);
  }
  const badPloCount = Object.values(byPlo).filter((total) => total !== 100).length;

  const canSubmit = weightsComplete && course.clos.length > 0 && course.lectureRows.length > 0 && underCovered.length === 0 && badPloCount === 0;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="instruments" code={course.code} title={course.title} status={course.templateStatus} />

      {!weightsComplete && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Complete Step 3 First</h3>
          {pendingException && pendingException.status === "pending" ? (
            <p style={{ fontSize: 12.5 }}>
              Your Assessment Weights are outside the OMC's policy range and are waiting on OMC approval — quiz/assignment/exam
              question selection below stays locked until they're approved (or you adjust the weights to fit the policy range).
            </p>
          ) : (
            <p style={{ fontSize: 12.5 }}>
              Before you can select which quizzes, assignments, or exam questions test which topics, finish setting the
              Assessment Weights (category %'s totalling 100%, within the OMC's allowed range) on the previous tab.
            </p>
          )}
          <Link href={`/subjectexpert/courses/${course.id}/weights`} style={{ fontSize: 12.5, color: "var(--brass-dark)", fontWeight: 600 }}>→ Go to Assessment Weights</Link>
        </div>
      )}

      {weightsComplete && <AssessmentsManager
        counts={{ Quiz: (course as unknown as { quizCount: number | null }).quizCount, Assignment: (course as unknown as { assignmentCount: number | null }).assignmentCount }}
        bestOf={{ Quiz: (course as unknown as { quizBestOf: number | null }).quizBestOf, Assignment: (course as unknown as { assignmentBestOf: number | null }).assignmentBestOf }}
        courseId={course.id}
        initialInstruments={course.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore, evidence: i.evidence.map((e) => ({ id: e.id, fileName: e.fileName, fileUrl: e.fileUrl, status: e.status, method: e.method, reasoning: e.reasoning })) }))}
        targets={{
          assignmentPct: course.assignmentPct, quizPct: course.quizPct,
          midtermPct: course.midtermPct, finalPct: course.finalPct,
          projectPct: course.projectPct, labPct: course.labPct,
        }}
        policyMax={policy ? {
          assignmentMax: policy.assignmentMax, quizMax: policy.quizMax, midtermMax: policy.midtermMax,
          finalMax: policy.finalMax, projectMax: policy.projectMax, labMax: policy.labMax,
        } : undefined}
        policyMinCount={policy ? {
          assignmentMinCount: policy.assignmentMinCount, quizMinCount: policy.quizMinCount, midtermMinCount: policy.midtermMinCount,
          finalMinCount: policy.finalMinCount, projectMinCount: policy.projectMinCount, labMinCount: policy.labMinCount,
        } : undefined}
        rows={course.lectureRows.map((r) => {
          const linkedInstruments = r.instrumentLinks
            .map((l) => course.assessmentInstruments.find((i) => i.id === l.instrumentId))
            .filter((i): i is (typeof course.assessmentInstruments)[number] => !!i);
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
            linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
            midtermQuestions: linkedInstruments.filter((i) => i.type === "Midterm").map((i) => i.label).join(", "),
            finalQuestions: linkedInstruments.filter((i) => i.type === "Final").map((i) => i.label).join(", "),
            weightPct: r.weightPct,
            cloId: r.cloId,
          };
        })}
        clos={await closWithPlo(course.clos.map((c) => ({ id: c.id, code: c.code, mappedPloId: c.mappedPloId })))}
        apiBase="/api/subjectexpert"
      />}

      {course.templateStatus === "changes-requested" && course.omcComment && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Changes Requested by OMC{reviewer ? ` (${reviewer.name})` : ""}</h3>
          <p style={{ fontSize: 12.5 }}>{course.omcComment}</p>
        </div>
      )}
      {course.templateStatus === "approved" && (
        <div className="card" style={{ borderColor: "var(--sage)" }}>
          <h3 style={{ fontSize: 14, color: "var(--sage)" }}>Approved by OMC{reviewer ? ` (${reviewer.name})` : ""}</h3>
          {course.omcComment && <p style={{ fontSize: 12.5, marginTop: 6 }}>{course.omcComment}</p>}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Ready to submit?</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          {course.clos.length} CLO(s), {course.lectureRows.length} lecture row(s). Once submitted, the OMC will review this template.
        </p>
        {!weightsComplete && (
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 12 }}>
            Not ready yet — Assessment Weights (step 3) aren't confirmed yet.
          </p>
        )}
        {underCovered.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 12 }}>
            Not ready yet — these CLOs need at least 3 lecture topics each: {underCovered.map((c) => c.code).join(", ")}
          </p>
        )}
        {badPloCount > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 12 }}>
            Not ready yet — {badPloCount} PLO(s) have CLO contribution percentages that don't add up to 100%
            (see the CLOs & PLO Mapping tab).
          </p>
        )}
        <SubmitTemplateButton courseId={course.id} disabled={!canSubmit || course.templateStatus === "submitted" || course.templateStatus === "approved"} />
      </div>
    </Shell>
  );
}
