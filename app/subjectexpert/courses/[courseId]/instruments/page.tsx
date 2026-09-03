import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import AssessmentsManager from "../../../../../components/AssessmentsManager";
import SubmitTemplateButton from "../../../../../components/SubmitTemplateButton";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function InstrumentsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      assessmentInstruments: { where: { source: "SE" }, orderBy: [{ type: "asc" }, { label: "asc" }] },
      lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" }, include: { instrumentLinks: true } },
      clos: { where: { source: "SE" } },
    },
  });
  if (!course) notFound();
  if (course.subjectExpertId !== user.id) notFound();

  const cloHitCounts: Record<string, number> = {};
  for (const c of course.clos) cloHitCounts[c.id] = 0;
  for (const r of course.lectureRows) if (r.cloId) cloHitCounts[r.cloId] = (cloHitCounts[r.cloId] || 0) + 1;
  const underCovered = course.clos.filter((c) => (cloHitCounts[c.id] || 0) < 3);

  const byPlo: Record<string, number> = {};
  for (const c of course.clos) {
    if (c.mappedPloId) byPlo[c.mappedPloId] = (byPlo[c.mappedPloId] || 0) + (c.ploContributionPct || 0);
  }
  const badPloCount = Object.values(byPlo).filter((total) => total !== 100).length;

  const canSubmit = course.clos.length > 0 && course.lectureRows.length > 0 && underCovered.length === 0 && badPloCount === 0;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="instruments" code={course.code} title={course.title} status={course.templateStatus} />

      <AssessmentsManager
        courseId={course.id}
        initialInstruments={course.assessmentInstruments.map((i) => ({ id: i.id, type: i.type, label: i.label, marksPct: i.marksPct }))}
        targets={{
          assignmentPct: course.assignmentPct, quizPct: course.quizPct,
          midtermPct: course.midtermPct, finalPct: course.finalPct,
          projectPct: course.projectPct, labPct: course.labPct,
        }}
        rows={course.lectureRows.map((r) => {
          const linkedInstruments = r.instrumentLinks
            .map((l) => course.assessmentInstruments.find((i) => i.id === l.instrumentId))
            .filter((i): i is (typeof course.assessmentInstruments)[number] => !!i);
          return {
            id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic,
            linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId),
            midtermQuestions: linkedInstruments.filter((i) => i.type === "Midterm").map((i) => i.label).join(", "),
            finalQuestions: linkedInstruments.filter((i) => i.type === "Final").map((i) => i.label).join(", "),
            weightPct: r.weightPct,
          };
        })}
        apiBase="/api/subjectexpert"
      />

      {course.templateStatus === "changes-requested" && course.omcComment && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Changes Requested by OMC</h3>
          <p style={{ fontSize: 12.5 }}>{course.omcComment}</p>
        </div>
      )}
      {course.templateStatus === "approved" && (
        <div className="card" style={{ borderColor: "var(--sage)" }}>
          <h3 style={{ fontSize: 14, color: "var(--sage)" }}>Approved by OMC</h3>
          {course.omcComment && <p style={{ fontSize: 12.5, marginTop: 6 }}>{course.omcComment}</p>}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Ready to submit?</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          {course.clos.length} CLO(s), {course.lectureRows.length} lecture row(s). Once submitted, the OMC will review this template.
        </p>
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
