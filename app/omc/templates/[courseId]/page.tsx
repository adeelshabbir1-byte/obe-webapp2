import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import OmcDecisionForm from "../../../../components/OmcDecisionForm";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function OmcTemplateDetailPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      coordinator: true, subjectExpert: true,
      clos: { orderBy: { code: "asc" }, include: { mappedPlo: true } },
      lectureRows: { orderBy: { lectureNumber: "asc" }, include: { clo: true } },
    },
  });
  if (!course || course.coordinator.managedById !== user.managedById) notFound();

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{course.code} — {course.title}</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>Subject Expert: {course.subjectExpert?.name || "—"}</div>
        </div>
        <a href="/omc/queue" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to queue</a>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>CLOs</h3>
        <table>
          <thead><tr><th>Code</th><th>Outcome</th><th>Bloom</th><th>Mapped PLO</th><th>Contribution</th></tr></thead>
          <tbody>
            {course.clos.map((c) => (
              <tr key={c.id}><td>{c.code}</td><td>{c.statement}</td><td>{c.bloomLevel}</td><td>{c.mappedPlo ? `PLO-${c.mappedPlo.number}: ${c.mappedPlo.title}` : "—"}</td><td>{c.mappedPlo ? `${c.ploContributionPct ?? 100}%` : "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>30-Lecture Schedule ({course.lectureRows.length}/30)</h3>
        <table>
          <thead><tr><th>Wk</th><th>Lec</th><th>Topic</th><th>Sub Topic</th><th>CLO</th><th>Bloom</th><th>Weight</th></tr></thead>
          <tbody>
            {course.lectureRows.map((r) => (
              <tr key={r.id}><td>{r.week}</td><td>{r.lectureNumber}</td><td>{r.topic}</td><td>{r.subtopic || "—"}</td><td>{r.clo?.code || "—"}</td><td>{r.bloomLevel || "—"}</td><td>{r.weightPct}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Assessment Weights</h3>
        <div style={{ fontSize: 12.5, color: "var(--slate)" }}>
          Assignment {course.assignmentPct}% · Quiz {course.quizPct}% · Project {course.projectPct}% · Lab {course.labPct}% · Midterm {course.midtermPct}% · Final {course.finalPct}%
        </div>
      </div>

      <OmcDecisionForm courseId={course.id} currentComment={course.omcComment} />
    </Shell>
  );
}
