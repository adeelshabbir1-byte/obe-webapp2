import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { ActionButton } from "../../components/fyp/FypClient";
import { KINDS, requestsFor, termKeyLabel } from "../../lib/planRequests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Degree plan requests" };

// Requests from course advisors that this person decides: summer load of 12 (Program Lead), a course before its semester
// (HOD / Chairman / Dean), a new course in summer (Dean).
export default async function PlanRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const rows = await requestsFor(user.id);
  const ids = Array.from(new Set((rows || []).flatMap((r) => [r.studentId])));
  const students = new Map((await prisma.student.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((s) => [s.id, s]));
  const people = new Map((await prisma.user.findMany({ where: { id: { in: (rows || []).map((r) => r.requestedById).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const pending = (rows || []).filter((r) => r.status === "PENDING");
  const done = (rows || []).filter((r) => r.status !== "PENDING").slice(0, 50);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Degree Plan Requests</h1>
      <p className="small-note" style={{ maxWidth: 900 }}>Course advisors ask for exceptions in a student&apos;s degree plan: a summer load of 12 credit hours (decided by the Program Lead), a course before its own semester (HOD, Chairman or Dean), or a course in summer the student has never taken (Dean). Once approved, the planner uses it.</p>
      {rows === null && <div className="err">Run prisma/migration_degree_planner.sql in Supabase first.</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <b>Waiting for you ({pending.length})</b>
        {pending.length === 0 ? <p className="small-note">Nothing waiting.</p> : (
          <table style={{ fontSize: 13, marginTop: 6 }}>
            <thead><tr><th>Student</th><th>Request</th><th>From</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {pending.map((r) => { const s = students.get(r.studentId); return (
                <tr key={r.id}>
                  <td><b>{s?.name}</b> <span className="small-note">{s?.rollNumber} · {s?.batch?.degreeProgram} — {s?.batch?.batchName}</span></td>
                  <td>{KINDS[r.kind]?.label}{r.courseCode ? ` — ${r.courseCode}` : ""}{r.termKey ? ` · ${termKeyLabel(r.termKey)}` : ""}</td>
                  <td>{people.get(r.requestedById) || ""}<div className="small-note">{r.createdAt.toISOString().slice(0, 10)}</div></td>
                  <td className="small-note" style={{ maxWidth: 260 }}>{r.note || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <ActionButton url="/api/plan-requests" body={{ id: r.id, approve: true }} label="Approve" />{" "}
                    <ActionButton url="/api/plan-requests" body={{ id: r.id, approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="Why not? (sent to the advisor)" />
                  </td>
                </tr>); })}
            </tbody>
          </table>
        )}
      </div>
      {done.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <b>Decided by you</b>
          <table style={{ fontSize: 12.5, marginTop: 6 }}>
            <tbody>{done.map((r) => { const s = students.get(r.studentId); return <tr key={r.id}><td>{s?.name} <span className="small-note">{s?.rollNumber}</span></td><td>{KINDS[r.kind]?.label}{r.courseCode ? ` — ${r.courseCode}` : ""}{r.termKey ? ` · ${termKeyLabel(r.termKey)}` : ""}</td><td style={{ color: r.status === "APPROVED" ? "#23894f" : "#c93c3c", fontWeight: 600 }}>{r.status.toLowerCase()}</td><td className="small-note">{r.decidedAt?.toISOString().slice(0, 10)}</td><td><Link href={`/advisor/students/${r.studentId}`} className="small-note">plan</Link></td></tr>; })}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
