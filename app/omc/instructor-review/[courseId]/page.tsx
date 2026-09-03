import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { computeTopicVariance } from "../../../../lib/varianceReport";
import Shell from "../../../../components/Shell";
import GuidanceThread from "../../../../components/GuidanceThread";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function InstructorReviewDetailPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true, instructor: true, batch: true } });
  if (!course || course.coordinator.managedById !== user.managedById) notFound();

  const variance = await computeTopicVariance(course.id);
  const guidance = await prisma.instructorGuidanceComment.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "asc" } });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{course.code} — {course.title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
            Instructor: {course.instructor?.name || "—"} · {course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—"}
          </div>
        </div>
        <a href="/omc/instructor-review" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to list</a>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: variance.adherencePct >= 80 ? "var(--sage)" : "var(--rust)", fontFamily: "Georgia, serif" }}>{variance.adherencePct}%</div>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>Plan Adherence</div>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: variance.missed.length > 0 ? "var(--rust)" : "var(--sage)", fontFamily: "Georgia, serif" }}>{variance.missed.length}</div>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>Topics Missed</div>
          </div>
        </div>

        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Planned vs. Actual, by Topic</h3>
        <table>
          <thead><tr><th>Topic</th><th>Planned Lectures</th><th>Planned Marks%</th><th>Actual Lectures</th><th>Actual Marks%</th><th>Status</th></tr></thead>
          <tbody>
            {variance.topics.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No planned topics yet.</td></tr>}
            {variance.topics.map((t) => (
              <tr key={t.topic} style={{ background: !t.covered ? "#FFE4DC" : undefined }}>
                <td>{t.topic}</td><td>{t.plannedLectures}</td><td>{t.plannedWeightPct}%</td>
                <td>{t.actualLectures}</td><td>{t.actualWeightPct}%</td>
                <td>{t.covered ? <span style={{ color: "var(--sage)" }}>Covered</span> : <span style={{ color: "var(--rust)", fontWeight: 600 }}>Missed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GuidanceThread
        courseId={course.id}
        apiBase="/api/instructor"
        initialComments={guidance.map((g) => ({ id: g.id, body: g.body, authorRole: g.authorRole, createdAt: g.createdAt.toISOString() }))}
      />
    </Shell>
  );
}
