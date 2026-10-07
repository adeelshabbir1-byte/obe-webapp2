import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { peerGroupsFor } from "../../../../lib/coTeachers";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";

export default async function PeerPlanPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  // Only plans of people teaching the same course as you.
  const groups = await peerGroupsFor(user);
  if (!groups.some((g) => g.entries.some((e) => e.courseId === params.courseId))) notFound();

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } },
  });
  if (!course) notFound();

  // Their own working copy if they have started one, otherwise the Subject Expert's plan it is based on.
  const [insClos, insRows, insInstruments] = await Promise.all([
    prisma.cLO.count({ where: { courseId: course.id, source: "INSTRUCTOR" } }),
    prisma.lectureRow.count({ where: { courseId: course.id, source: "INSTRUCTOR" } }),
    prisma.assessmentInstrument.count({ where: { courseId: course.id, source: "INSTRUCTOR" } }),
  ]);
  const started = insClos + insRows + insInstruments > 0;
  const source = started ? "INSTRUCTOR" : "SE";
  const [clos, rows, instruments] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id, source }, orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source }, orderBy: { lectureNumber: "asc" }, include: { clo: { select: { code: true } } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
  ]);

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <p style={{ fontSize: 12.5, margin: "0 0 6px" }}><Link href="/instructor/peers" style={{ color: "var(--brass-dark)" }}>← Colleagues’ Plans</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Taught by <b>{course.instructor?.name || "—"}</b>{course.batch ? ` · ${course.batch.degreeProgram} — ${course.batch.batchName}` : ""} · read only
        {started ? "" : " · they have not started their own copy yet, so this is the Subject Expert’s plan"}
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Course Learning Outcomes</h3>
        <table>
          <thead><tr><th>CLO</th><th>Statement</th><th>Bloom</th><th>PLO</th></tr></thead>
          <tbody>
            {clos.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No CLOs yet.</td></tr>}
            {clos.map((c) => <tr key={c.id}><td>{c.code}</td><td>{c.statement}</td><td>{c.bloomLevel}</td><td>{c.mappedPlo ? `PLO-${c.mappedPlo.number}` : "—"}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lecture plan</h3>
        <table>
          <thead><tr><th>Wk</th><th>Lec</th><th>Topic</th><th>Subtopic</th><th>CLO</th><th>Bloom</th><th>Weight</th>{started && <th>Delivered on</th>}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No lecture plan yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.week}</td><td>{r.lectureNumber}</td><td>{r.topic}</td><td>{r.subtopic || "—"}</td><td>{r.clo?.code || "—"}</td><td>{r.bloomLevel || "—"}</td><td>{r.weightPct}%</td>
                {started && <td>{r.actualDate ? r.actualDate.toISOString().slice(0, 10) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Assessments</h3>
        <table>
          <thead><tr><th>Type</th><th>Item</th><th>% of course</th><th>Out of</th></tr></thead>
          <tbody>
            {instruments.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No assessments set yet.</td></tr>}
            {instruments.map((i) => <tr key={i.id}><td>{i.type}</td><td>{i.label}</td><td>{i.marksPct}%</td><td>{i.maxScore}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
