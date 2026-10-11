import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import LectureContentManager from "../../../../../components/LectureContentManager";
import { navForRole } from "../../../../../components/reportNav";
import { ploCoverageShortfalls } from "../../../../../lib/ploCoverage";
import { isTeachingTopic } from "../../../../../lib/courseProgress";


export default async function SchedulePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      clos: { where: { source: "SE" }, orderBy: { code: "asc" } },
      lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" } },
    },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  // The OMC decides the minimum lecture topics per CLO and per PLO (exam / review slots don't count).
  const coverage = await ploCoverageShortfalls(course.id, "SE");
  const minClo = coverage.rules.cloMinTopics;
  const cloHitCounts: Record<string, number> = {};
  for (const c of course.clos) cloHitCounts[c.id] = 0;
  for (const r of course.lectureRows) if (r.cloId && isTeachingTopic(r.topic)) cloHitCounts[r.cloId] = (cloHitCounts[r.cloId] || 0) + 1;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="schedule" code={course.code} title={course.title} status={course.templateStatus} />
      <div className="card no-print" style={{ display: "flex", justifyContent: "flex-end" }}>
        <a href={`/api/subjectexpert/courses/${course.id}/weekly-plan-document`} className="btn btn-brass" style={{ textDecoration: "none" }}>Download Tentative Weekly Plan (Word)</a>
      </div>

      {course.clos.length > 0 && (
        <div className="card">
          <div className="lp-toolbar" style={{ marginBottom: 10 }}>
            <h3>CLO coverage</h3>
            <span className="lp-meta">{minClo > 0 ? `OMC minimum: ${minClo} lecture topic${minClo === 1 ? "" : "s"} per CLO` : "No OMC minimum per CLO"}{coverage.rules.ploMinTopics > 0 ? ` · ${coverage.rules.ploMinTopics} per PLO` : ""}</span>
          </div>
          <div className="lp-chips">
            {course.clos.map((c) => {
              const n = cloHitCounts[c.id] || 0;
              const ok = n >= minClo;
              return (
                <span key={c.id} className={`lp-chip ${ok ? "ok" : "short"}`} title={ok ? "Meets the OMC minimum" : `Needs ${minClo - n} more lecture${minClo - n === 1 ? "" : "s"}`}>
                  <i />{c.code}<small>{n} lecture{n === 1 ? "" : "s"}{!ok ? ` · ${minClo - n} more needed` : ""}</small>
                </span>
              );
            })}
          </div>
          {coverage.topicShort.length > 0 ? (
            <p className="lp-hint" style={{ color: "var(--amber-800)" }}>
              Below the OMC&apos;s minimum, so this template can&apos;t be submitted yet: {coverage.topicShort.join("; ")}.
            </p>
          ) : (
            <p className="lp-hint">The OMC&apos;s minimums are met. Lectures without a CLO (or not tested by an assessment) are fine.</p>
          )}
        </div>
      )}

      <LectureContentManager
        courseId={course.id}
        initialRows={course.lectureRows.map((r) => ({
          id: r.id, week: r.week, lectureNumber: r.lectureNumber, topic: r.topic, subtopic: r.subtopic,
          cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct,
        }))}
        clos={course.clos.map((c) => ({ id: c.id, code: c.code }))}
        apiBase="/api/subjectexpert"
        generateEndpoint={`/api/subjectexpert/courses/${course.id}/lecture/generate`}
      />
    </Shell>
  );
}
