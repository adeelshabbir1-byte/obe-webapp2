import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor, coordinatorIdsFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HistoryUpload from "../../components/HistoryUpload";
import { buildModel, validate, difficulty, atRisk, UPLOAD_COLUMNS } from "../../lib/prediction";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Performance Prediction" };
const MANAGERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"];
const pct = (x: number) => `${Math.round(100 * x)}%`;
const color = (r: number) => (r >= 0.4 ? "#B3261E" : r >= 0.2 ? "#C58A12" : "#2E7D4F");

export default async function PredictionPage({ searchParams }: { searchParams: { course?: string; batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const manager = MANAGERS.includes(user.role);
  const [myCourses, myBatches] = await Promise.all([
    prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }] }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" } }),
    manager ? prisma.batch.findMany({ where: { coordinatorId: { in: (await coordinatorIdsFor(user)).concat("none") }, students: { some: { status: "ACTIVE" } } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "asc" }] })
      : prisma.batch.findMany({ where: { advisorId: user.id }, select: { id: true, degreeProgram: true, batchName: true } }),
  ]);
  if (!manager && !myCourses.length && !myBatches.length) redirect("/dashboard");
  const m = await buildModel(chairmanId);
  const course = searchParams.course && (manager || myCourses.some((c) => c.id === searchParams.course)) ? searchParams.course : null;
  const batch = searchParams.batch && myBatches.some((b) => b.id === searchParams.batch) ? searchParams.batch : null;
  const list = course ? await atRisk(m, { courseId: course }) : batch ? await atRisk(m, { batchId: batch }) : null;
  const val = !list && manager ? await validate(chairmanId) : null;
  const diff = !list ? difficulty(m).slice(0, 15) : [];
  const title = course ? myCourses.find((c) => c.id === course)?.code || "Course" : batch ? myBatches.find((b) => b.id === batch)?.batchName || "Batch" : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <HowCalculated shows="Predictions from past results — every number comes with the reason behind it. They are estimates to guide advising, never grades.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Course grade</b>: for each course, a straight line fitted between past students' grade points and their CGPA before the course (needs 8 or more past students); otherwise the student's CGPA shifted by how much harder or easier the course has been than average.</li>
          <li><b>Fail risk</b>: of past students with a CGPA within ±0.3 of this student's who took the course, the share who failed.</li>
          <li><b>Term GPA</b>: the predicted grades of the enrolled courses, weighted by credit hours. <b>Final CGPA</b>: the remaining credits at the student's recent term GPAs.</li>
          <li><b>Dropout / on-time graduation</b>: what happened to past students with a similar CGPA after the same number of terms.</li>
          <li>Accuracy is checked by fitting on all terms except the last two and testing on those two.</li>
        </ul>
      </HowCalculated>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Performance Prediction{title ? ` — ${title}` : ""}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        Learned from {m.data.records.toLocaleString()} past course results of {m.data.students.toLocaleString()} students ({m.data.finished} finished their studies){m.data.uploaded > 0 ? `, including ${m.data.uploaded.toLocaleString()} uploaded past-year results` : ""}.
        Every prediction says what it is based on. It is a guide for advising, not a verdict on a student.
      </p>
      <div className="card small-note">
        {myCourses.length > 0 && <>My courses: {myCourses.map((c) => <Link key={c.id} href={`/prediction?course=${c.id}`} style={{ marginRight: 8 }}>{c.code}</Link>)}<br /></>}
        {myBatches.length > 0 && <>Batches: {myBatches.map((b) => <Link key={b.id} href={`/prediction?batch=${b.id}`} style={{ marginRight: 8 }}>{b.degreeProgram} {b.batchName}</Link>)}</>}
        {list && <><br /><Link href="/prediction">← overview</Link></>}
      </div>
      {list && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Students by predicted fail risk</h3>
          {list.length === 0 ? <p className="small-note">No enrolled students.</p> : (
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Student</th>{batch && <th>Course</th>}<th style={{ textAlign: "center" }}>CGPA</th><th style={{ textAlign: "center" }}>Likely grade</th><th style={{ textAlign: "center" }}>Fail risk</th><th>Why</th></tr></thead>
              <tbody>{list.slice(0, 300).map((r, i) => <tr key={i}><td><Link href={`/prediction/student/${r.studentId}`}>{r.name}</Link> <span className="small-note">{r.roll}</span></td>{batch && <td>{r.code}</td>}<td style={{ textAlign: "center" }}>{r.cgpa ?? "new"}</td><td style={{ textAlign: "center" }}>{r.grade}</td><td style={{ textAlign: "center", fontWeight: 700, color: color(r.risk) }}>{pct(r.risk)}</td><td className="small-note">{r.why}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      {!list && manager && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add past years</h3>
          <p className="small-note" style={{ marginTop: 0 }}>One row per student per course. Columns: <code>{UPLOAD_COLUMNS.join(", ")}</code>. Grade or GPA points is needed; outcome = GRADUATED / DROPPED / ACTIVE (same on every row of the student). Uploading the same program and intake again replaces it.</p>
          <HistoryUpload />
        </div>
      )}
      {val && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>How accurate is it?</h3>
          <p style={{ fontSize: 13, margin: 0 }}>Fitted on results {val.trainedOn} and tested on {val.results.toLocaleString()} results {val.testedOn} it had not seen:
            grades were off by {val.mae} grade points on average, {val.within}% within one grade step (e.g. B vs B+); of {val.fails} actual fails, {val.failCaught ?? "—"}% were flagged at 30%+ risk, and {val.flaggedRight ?? "—"}% of flagged students did fail.</p>
        </div>
      )}
      {!list && manager && !val && <div className="card small-note">The accuracy check needs results from at least four terms.</div>}
      {diff.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Hardest courses (from past results)</h3>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th style={{ textAlign: "center" }}>Students</th><th style={{ textAlign: "center" }}>Mean grade points</th><th style={{ textAlign: "center" }}>Failed</th><th style={{ textAlign: "center" }}>Below students&apos; CGPA by</th></tr></thead>
            <tbody>{diff.map((d) => <tr key={d.code}><td>{d.code}</td><td style={{ textAlign: "center" }}>{d.n}</td><td style={{ textAlign: "center" }}>{d.meanGp}</td><td style={{ textAlign: "center" }}>{d.failPct}%</td><td style={{ textAlign: "center", color: d.harder > 0.4 ? "#B3261E" : undefined }}>{d.harder}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
