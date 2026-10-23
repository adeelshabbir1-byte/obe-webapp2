import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor, coordinatorIdsFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { earlyWarning } from "../../lib/earlyWarning";
import PersonAvatar from "../../components/PersonAvatar";
import { studentPhotos } from "../../lib/studentPhotos";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Early warning" };
const COLOR = { HIGH: "#c93c3c", MEDIUM: "#c98a0b", LOW: "#23894f" };

// Students at risk now — attendance, marks so far, CGPA and missed work — for the advisor (their batches) and for the
// program's staff (their programs).
export default async function EarlyWarningPage({ searchParams }: { searchParams: { all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const advised = (await prisma.batch.findMany({ where: { advisorId: user.id }, select: { id: true } })).map((b) => b.id);
  const staff = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "STUDENT_AFFAIRS"].includes(user.role);
  if (!advised.length && !staff) redirect("/dashboard");
  const batchIds = staff && !["CHAIRMAN", "STUDENT_AFFAIRS"].includes(user.role) ? (await prisma.batch.findMany({ where: { coordinatorId: { in: (await coordinatorIdsFor(user)).concat(["none"]) } }, select: { id: true } })).map((b) => b.id) : staff ? undefined : advised;
  const rows = await earlyWarning(chairmanId, { batchIds: staff ? batchIds : advised });
  const shown = searchParams.all ? rows : rows.filter((r) => r.level !== "LOW");
  const photos = await studentPhotos(shown.map((r) => r.studentId));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <HowCalculated shows="A risk level for every student, from what the system already holds — so the advisor hears about a student in week 5, not at results time.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>CGPA below 2.00: <b>+3</b> points; below 2.50: <b>+1</b>.</li>
          <li>Attendance below the minimum in a course: <b>+3</b>; within 5% of it: <b>+1</b>.</li>
          <li>Marks so far under 50% of what has been assessed in a course: <b>+2</b>; 15 points under the class average: <b>+1</b>.</li>
          <li>Two or more assessments missed that classmates have marks for: <b>+2</b>.</li>
          <li><b>HIGH</b> risk from 5 points, <b>MEDIUM</b> from 3, otherwise LOW.</li>
        </ul>
      </HowCalculated>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Early Warning</h1>
      <p className="small-note" style={{ maxWidth: 900 }}>Students at risk now, from attendance, marks so far, CGPA and missed assessments — before the results. High from 5 points, medium from 3: CGPA under 2.00 (+3) or 2.50 (+1); attendance under the minimum (+3) or near it (+1) in a course; marks under 50% so far (+2) or 15 points under the class (+1); two or more assessments missed (+2). Advisors also get a weekly notice of their high-risk students.</p>
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(["HIGH", "MEDIUM", "LOW"] as const).map((l) => <span key={l}><b style={{ color: COLOR[l] }}>{rows.filter((r) => r.level === l).length}</b> {l.toLowerCase()}</span>)}
        <Link href={searchParams.all ? "/early-warning" : "/early-warning?all=1"} className="small-note" style={{ marginLeft: "auto" }}>{searchParams.all ? "Hide low risk" : "Show everyone"}</Link>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {shown.length === 0 ? <p className="small-note">No student at risk.</p> : (
          <table style={{ fontSize: 13 }}><thead><tr><th>Risk</th><th>Student</th><th>Batch</th><th>Why</th><th></th></tr></thead>
            <tbody>{shown.map((r) => <tr key={r.studentId}><td style={{ color: COLOR[r.level], fontWeight: 700 }}>{r.level.toLowerCase()} ({r.points})</td><td style={{ whiteSpace: "nowrap" }}><PersonAvatar name={r.name} photo={photos.get(r.studentId)} size={28} />{r.name} <span className="small-note">{r.roll}</span></td><td className="small-note">{r.batch}</td><td style={{ fontSize: 12.5 }}>{r.reasons.join(" · ") || "—"}</td><td style={{ whiteSpace: "nowrap" }}>{r.advisorId === user.id && <><Link href={`/advisor/students/${r.studentId}`} className="small-note">open</Link> <Link href={`/counselling?callIn=${r.studentId}`} className="small-note">call in</Link></>} <Link href={`/prediction/student/${r.studentId}`} className="small-note">prediction</Link></td></tr>)}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
