import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import StudentPicker from "../../../../components/StudentPicker";
import Shell from "../../../../components/Shell";
import { buildModel, studentPrediction } from "../../../../lib/prediction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const pct = (x: number) => `${Math.round(100 * x)}%`;

export default async function StudentPredictionPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const st = await prisma.student.findUnique({ where: { id: params.id }, select: { batch: { select: { advisorId: true, coordinator: { select: { managedById: true } } } }, enrollments: { select: { course: { select: { instructorId: true, sectionAssignments: { select: { instructorId: true } } } } } } } }).catch(() => null);
  if (!st || st.batch.coordinator.managedById !== chairmanId) notFound();
  const teaches = st.enrollments.some((e) => e.course.instructorId === user.id || e.course.sectionAssignments.some((a) => a.instructorId === user.id));
  if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"].includes(user.role) && st.batch.advisorId !== user.id && !teaches) notFound();
  const m = await buildModel(chairmanId);
  const p = await studentPrediction(m, params.id);
  if (!p) notFound();
  const color = (r: number) => (r >= 0.4 ? "#B3261E" : r >= 0.2 ? "#C58A12" : "#2E7D4F");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/prediction">← Prediction</Link></p>
      <StudentPicker current={params.id} template="/prediction/student/{id}" label="Another student" />
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>{p.student.name} <span className="small-note">{p.student.roll} · {p.student.batch}</span></h1>
      <div className="stat-grid">
        <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{p.cgpa ?? "—"}</div><div className="small-note">CGPA now ({p.terms} term(s), {p.credits} credits)</div></div>
        <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{p.termGpa ?? "—"}</div><div className="small-note">Likely GPA this term</div></div>
        <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{p.finalCgpa ?? "—"}</div><div className="small-note">Likely CGPA at graduation</div></div>
        <div className="stat"><div style={{ fontSize: 22, fontWeight: 700, color: p.outcome ? color(p.outcome.dropout) : undefined }}>{p.outcome ? pct(p.outcome.dropout) : "—"}</div><div className="small-note">Dropout risk</div></div>
        <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{p.outcome ? pct(p.outcome.onTime) : "—"}</div><div className="small-note">Graduates on time</div></div>
      </div>
      <div className="card" style={{ fontSize: 12.5 }}>
        <div><b>This term:</b> {p.termWhy}.</div>
        <div><b>At graduation:</b> {p.finalWhy}.</div>
        <div><b>Dropout / on time:</b> {p.outcome ? p.outcome.why : "Not enough finished students with a similar record yet — upload past years to improve this."}</div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Current courses</h3>
        {p.courses.length === 0 ? <p className="small-note">No current enrolments.</p> : (
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th style={{ textAlign: "center" }}>Likely grade</th><th>Based on</th><th style={{ textAlign: "center" }}>Fail risk</th><th>Based on</th></tr></thead>
            <tbody>{p.courses.map((c) => <tr key={c.code}><td><b>{c.code}</b> {c.title}</td><td style={{ textAlign: "center" }}>{c.letter}{c.gp !== null ? ` (${c.gp})` : ""}</td><td className="small-note">{c.gradeWhy}</td><td style={{ textAlign: "center", fontWeight: 700, color: color(c.risk) }}>{pct(c.risk)}</td><td className="small-note">{c.riskWhy}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
