import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { ballotsOf, candidatesOf, electionsOf, onBallot, phase, PHASE_TEXT, plansOf, SCOPES } from "../../../lib/elections";
import { sessionNow } from "../../../lib/studentActivities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society elections" };

const day = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const stat = (s: string) => <span style={{ fontWeight: 600, color: s === "APPROVED" ? "#23894f" : s === "REJECTED" ? "#c93c3c" : "#c98a0b" }}>{s.toLowerCase()}</span>;

// Society elections for the Societies Head (Student Affairs) and the societies' faculty advisors.
export default async function SocietyElectionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const head = ["STUDENT_AFFAIRS", "CHAIRMAN"].includes(user.role);
  const societies = await prisma.studentSociety.findMany({ where: { chairmanId }, select: { id: true, name: true, advisorId: true, departmentId: true }, orderBy: { name: "asc" } });
  const mine = societies.filter((s) => s.advisorId === user.id || (head && !s.advisorId));
  if (!head && !mine.length) redirect("/dashboard");
  const all = await electionsOf(chairmanId);
  const elections = head ? all : all.filter((e) => mine.some((s) => s.id === e.societyId));
  const cands = await candidatesOf(elections.map((e) => e.id));
  const students = new Map((await prisma.student.findMany({ where: { id: { in: cands.map((c) => c.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const socName = new Map(societies.map((s) => [s.id, s.name]));
  const plans = await plansOf({ societyId: { in: (head ? societies : mine).map((s) => s.id).concat(["none"]) } });
  const planStudents = new Map((await prisma.student.findMany({ where: { id: { in: plans.map((p) => p.studentId).concat(["none"]) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const events = new Map((await prisma.societyEvent.findMany({ where: { id: { in: plans.map((p) => p.eventId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, title: true, eventDate: true } })).map((e) => [e.id, e]));
  const fields = [
    { name: "societyId", label: "Society", type: "select" as const, options: societies.map((s) => [s.id, s.name] as [string, string]), width: 220 },
    { name: "title", label: "Title", width: 240 },
    { name: "positions", label: "Positions (comma)", width: 320 },
    { name: "voterScope", label: "Who votes", type: "select" as const, options: Object.entries(SCOPES) as [string, string][], width: 240 },
    { name: "term", label: "Term of office", width: 90 },
    { name: "applyFrom", label: "Applications open", type: "datetime-local" as const }, { name: "applyTo", label: "Applications close", type: "datetime-local" as const },
    { name: "voteFrom", label: "Voting opens", type: "datetime-local" as const }, { name: "voteTo", label: "Voting closes", type: "datetime-local" as const },
    { name: "minCgpa", label: "Min CGPA (candidates)", type: "number" as const, width: 110 }, { name: "minSemester", label: "Min semester", type: "number" as const, width: 100 },
  ];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Society Elections</h1>
      <p className="small-note" style={{ maxWidth: 920 }}>Students apply with a 2-minute speech and their plan for the year. The society&apos;s faculty advisor approves the candidate and the material, then the Societies Head gives final approval. Voting is online and secret. Once the result is published the winners become the society&apos;s office holders for the term: they plan events (with a check against the calendar and the timetable), submit a plan for the year and report each event, which the advisor approves.</p>
      {head && <div className="card"><ActionForm url="/api/societies/elections" fixed={{ action: "save" }} submit="Open election" collapsed openLabel="+ New election" initial={{ voterScope: "SOCIETY", term: sessionNow(), positions: "President, Vice President, General Secretary, Treasurer" }} fields={fields} /></div>}
      {elections.length === 0 && <div className="card"><p className="small-note" style={{ margin: 0 }}>No elections yet.</p></div>}
      {await Promise.all(elections.map(async (e) => {
        const ph = phase(e);
        const cs = cands.filter((c) => c.electionId === e.id);
        const voters = new Set((await ballotsOf(e.id)).map((x) => x.studentId)).size;
        const advisorHere = mine.some((s) => s.id === e.societyId);
        const showVotes = ph === "COUNTED" || ph === "PUBLISHED";
        return (
          <div key={e.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div><b style={{ fontSize: 15 }}>{e.title}</b> <span className="small-note">· {socName.get(e.societyId)} · term {e.term} · {SCOPES[e.voterScope]}</span></div>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="badge badge-neutral">{PHASE_TEXT[ph]}</span>{(ph === "VOTING" || showVotes) && <span className="small-note">{voters} voted</span>}
                {head && ph === "COUNTED" && <ActionButton url="/api/societies/elections" body={{ action: "publish", id: e.id }} label="Publish result" confirmText="Publish the result? The winners become office holders for the term." />}</span>
            </div>
            <p className="small-note" style={{ margin: "4px 0" }}>Applications {day(e.applyFrom)} – {day(e.applyTo)} · voting {day(e.voteFrom)} – {day(e.voteTo)}{e.minCgpa ? ` · CGPA ≥ ${e.minCgpa}` : ""}{e.minSemester ? ` · semester ≥ ${e.minSemester}` : ""}</p>
            {head && !e.published && <ActionForm url="/api/societies/elections" fixed={{ action: "save", id: e.id }} submit="Save" collapsed openLabel="Edit" initial={{ societyId: e.societyId, title: e.title, positions: e.positions.join(", "), voterScope: e.voterScope, term: e.term, applyFrom: e.applyFrom.toISOString().slice(0, 16), applyTo: e.applyTo.toISOString().slice(0, 16), voteFrom: e.voteFrom.toISOString().slice(0, 16), voteTo: e.voteTo.toISOString().slice(0, 16), minCgpa: e.minCgpa ?? "", minSemester: e.minSemester ?? "" }} fields={fields} />}
            {e.positions.map((pos) => {
              const xs = cs.filter((c) => c.position === pos).sort((a, b) => (showVotes ? b.votes - a.votes : 0));
              return (
                <div key={pos} style={{ marginTop: 8 }}>
                  <b style={{ fontSize: 13 }}>{pos}</b> <span className="small-note">({xs.length} candidate{xs.length === 1 ? "" : "s"})</span>
                  {xs.length > 0 && <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{xs.map((c, i) => { const st = students.get(c.studentId); return (
                    <tr key={c.id} style={{ background: showVotes && i === 0 && onBallot(c) ? "rgba(46,157,91,.12)" : undefined }}>
                      <td style={{ minWidth: 180 }}><b>{st?.name}</b> <span className="small-note">{st?.rollNumber}</span>{c.videoUrl && <div><a href={c.videoUrl} target="_blank" rel="noreferrer" className="small-note">2-minute speech ↗</a></div>}</td>
                      <td style={{ maxWidth: 380 }}><details><summary className="small-note" style={{ cursor: "pointer" }}>Speech & plan</summary><div style={{ whiteSpace: "pre-wrap", fontSize: 12.5 }}>{c.manifesto}</div><div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 6 }}><b>Plan:</b> {c.plan}</div></details></td>
                      <td className="small-note">advisor {stat(c.advisorStatus)} · head {stat(c.headStatus)}{c.note ? <div>{c.note}</div> : null}</td>
                      {showVotes && <td style={{ fontWeight: 700 }}>{onBallot(c) ? `${c.votes} vote${c.votes === 1 ? "" : "s"}` : ""}</td>}
                      <td style={{ whiteSpace: "nowrap" }}>
                        {advisorHere && c.advisorStatus === "PENDING" && !e.published && <><ActionButton url="/api/societies/elections" body={{ action: "candidate", id: c.id, stage: "ADVISOR", approve: true }} label="Approve" /> <ActionButton url="/api/societies/elections" body={{ action: "candidate", id: c.id, stage: "ADVISOR", approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="Why? (shown to the student)" /></>}
                        {head && c.advisorStatus === "APPROVED" && c.headStatus === "PENDING" && !e.published && <><ActionButton url="/api/societies/elections" body={{ action: "candidate", id: c.id, stage: "HEAD", approve: true }} label="Final approval" /> <ActionButton url="/api/societies/elections" body={{ action: "candidate", id: c.id, stage: "HEAD", approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="Why? (shown to the student)" /></>}
                      </td>
                    </tr>); })}</tbody></table>}
                </div>
              );
            })}
          </div>
        );
      }))}
      <div className="card" style={{ overflowX: "auto" }}>
        <b>Office holders&apos; plans and event reports</b>
        {plans.length === 0 ? <p className="small-note">None yet.</p> : (
          <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Society</th><th>From</th><th>What</th><th>Text</th><th>Status</th><th></th></tr></thead>
            <tbody>{plans.map((p) => { const ev = p.eventId ? events.get(p.eventId) : null; const canDecide = mine.some((s) => s.id === p.societyId); return (
              <tr key={p.id}><td>{socName.get(p.societyId)}</td><td>{planStudents.get(p.studentId)}<div className="small-note">{p.createdAt.toISOString().slice(0, 10)}</div></td>
                <td>{p.kind === "YEAR_PLAN" ? `Plan for ${p.term}` : `Report: ${ev?.title || "event"}${ev ? ` (${ev.eventDate.toISOString().slice(0, 10)})` : ""}${p.participants ? ` · ${p.participants} took part` : ""}`}</td>
                <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{p.text.length > 400 ? `${p.text.slice(0, 400)}…` : p.text}</td><td>{stat(p.status)}{p.note ? <div className="small-note">{p.note}</div> : null}</td>
                <td style={{ whiteSpace: "nowrap" }}>{canDecide && p.status === "PENDING" && <><ActionButton url="/api/societies/elections" body={{ action: "plan", id: p.id, approve: true }} label="Approve" /> <ActionButton url="/api/societies/elections" body={{ action: "plan", id: p.id, approve: false }} label="Return" className="btn btn-secondary btn-sm" askNote="What should change?" /></>}</td></tr>); })}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
