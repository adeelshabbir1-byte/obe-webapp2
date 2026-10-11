import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import LectureContentManager from "../../../../../components/LectureContentManager";
import { navForRole } from "../../../../../components/reportNav";


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

  const cloHitCounts: Record<string, number> = {};
  for (const c of course.clos) cloHitCounts[c.id] = 0;
  for (const r of course.lectureRows) if (r.cloId) cloHitCounts[r.cloId] = (cloHitCounts[r.cloId] || 0) + 1;
  const underCovered = course.clos.filter((c) => (cloHitCounts[c.id] || 0) < 3);

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
            <span className="lp-meta">Each CLO needs at least 3 lectures</span>
          </div>
          <div className="lp-chips">
            {course.clos.map((c) => {
              const n = cloHitCounts[c.id] || 0;
              const ok = n >= 3;
              return (
                <span key={c.id} className={`lp-chip ${ok ? "ok" : "short"}`} title={ok ? "Covered" : `Needs ${3 - n} more lecture${3 - n === 1 ? "" : "s"}`}>
                  <i />{c.code}<small>{n} lecture{n === 1 ? "" : "s"}{!ok ? ` · ${3 - n} more needed` : ""}</small>
                </span>
              );
            })}
          </div>
          {underCovered.length > 0 && (
            <p className="lp-hint" style={{ color: "var(--amber-800)" }}>
              Every CLO must be covered by at least 3 lecture topics before this template can be submitted.
            </p>
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
