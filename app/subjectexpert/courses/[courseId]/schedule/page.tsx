import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import AddLectureRowForm from "../../../../../components/AddLectureRowForm";
import DeleteButton from "../../../../../components/DeleteButton";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function SchedulePage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      clos: { orderBy: { code: "asc" } },
      lectureRows: { orderBy: { lectureNumber: "asc" }, include: { clo: true } },
    },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  // Count how many lecture rows ("topics") hit each CLO — each must be hit
  // by at least 3 before the template can be submitted.
  const cloHitCounts: Record<string, number> = {};
  for (const c of course.clos) cloHitCounts[c.id] = 0;
  for (const r of course.lectureRows) if (r.cloId) cloHitCounts[r.cloId] = (cloHitCounts[r.cloId] || 0) + 1;
  const underCovered = course.clos.filter((c) => (cloHitCounts[c.id] || 0) < 3);

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="schedule" code={course.code} title={course.title} status={course.templateStatus} />

      {course.clos.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>CLO Coverage</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {course.clos.map((c) => {
              const n = cloHitCounts[c.id] || 0;
              const ok = n >= 3;
              return (
                <span key={c.id} style={{
                  fontSize: 11.5, padding: "4px 10px", borderRadius: 2,
                  background: ok ? "#E4EEE8" : "#F5EAE5", color: ok ? "var(--sage)" : "var(--rust)",
                }}>
                  {c.code}: {n} topic{n === 1 ? "" : "s"}{!ok ? ` (needs ${3 - n} more)` : ""}
                </span>
              );
            })}
          </div>
          {underCovered.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--rust)", marginTop: 10 }}>
              Every CLO must be covered by at least 3 lecture topics before this template can be submitted.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Wk</th><th>Lec</th><th>Topic</th><th>Sub Topic</th><th>CLO</th><th>Bloom</th><th>Weight</th><th></th></tr></thead>
          <tbody>
            {course.lectureRows.length === 0 && (
              <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No lecture rows yet (target: 30).</td></tr>
            )}
            {course.lectureRows.map((r) => (
              <tr key={r.id}>
                <td>{r.week}</td><td>{r.lectureNumber}</td><td>{r.topic}</td><td>{r.subtopic || "—"}</td>
                <td>{r.clo?.code || "—"}</td><td>{r.bloomLevel || "—"}</td><td>{r.weightPct}%</td>
                <td><DeleteButton endpoint={`/api/subjectexpert/courses/${course.id}/lecture/${r.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--slate)" }}>{course.lectureRows.length} / 30 lectures</div>
      </div>

      <AddLectureRowForm courseId={course.id} clos={course.clos.map((c) => ({ id: c.id, code: c.code }))} />
    </Shell>
  );
}
