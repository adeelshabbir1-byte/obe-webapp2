import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { ballotsOf, candidatesOf, electionsOf, mayVote, onBallot, phase, PHASE_TEXT, studentPlace } from "../../../lib/elections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Society elections" };
const API = "/api/student/elections";

// Society elections for students: apply for a position, see the candidates' speeches and plans, vote, see the result.
export default async function StudentElectionsPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  const place = await studentPlace(student.id);
  const elections = (await electionsOf(place?.chairmanId || "none")).filter((e) => phase(e) !== "UPCOMING");
  const cands = await candidatesOf(elections.map((e) => e.id));
  const names = new Map((await prisma.student.findMany({ where: { id: { in: cands.map((c) => c.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const socs = new Map((await prisma.studentSociety.findMany({ where: { id: { in: elections.map((e) => e.societyId).concat(["none"]) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Society Elections</h1>
        <p className="small-note">Stand for a society office with a 2-minute speech (a video link) and your plan for the year, read every candidate&apos;s speech and plan, and vote online. Your vote is secret: the system only records that you voted.</p>
        {elections.length === 0 && <div className="card"><p className="small-note" style={{ margin: 0 }}>No elections at the moment.</p></div>}
        {await Promise.all(elections.map(async (e) => {
          const ph = phase(e);
          const cs = cands.filter((c) => c.electionId === e.id);
          const mineApp = cs.find((c) => c.studentId === student.id);
          const voter = ph === "VOTING" ? await mayVote(student.id, e) : false;
          const myBallots = new Set((await ballotsOf(e.id, student.id)).map((b) => b.position));
          const showVotes = ph === "PUBLISHED";
          return (
            <div key={e.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><b style={{ fontSize: 15 }}>{e.title} <span className="small-note">· {socs.get(e.societyId)} · term {e.term}</span></b><span className="badge badge-neutral">{PHASE_TEXT[ph]}</span></div>
              <p className="small-note" style={{ margin: "4px 0" }}>Applications close {e.applyTo.toISOString().slice(0, 16).replace("T", " ")} · voting {e.voteFrom.toISOString().slice(0, 16).replace("T", " ")} – {e.voteTo.toISOString().slice(0, 16).replace("T", " ")}{e.minCgpa ? ` · candidates need CGPA ≥ ${e.minCgpa}` : ""}{e.minSemester ? `, semester ≥ ${e.minSemester}` : ""}</p>
              {ph === "APPLY" && !mineApp && <ActionForm url={API} fixed={{ action: "apply", electionId: e.id }} submit="Apply" collapsed openLabel="Stand for a position" done="Applied — the society's advisor reviews it." initial={{ position: e.positions[0] }}
                fields={[{ name: "position", label: "Position", type: "select", options: e.positions.map((p) => [p, p] as [string, string]) }, { name: "videoUrl", label: "2-minute speech (video link)", width: 320 }, { name: "manifesto", label: "Your message to voters", type: "textarea", full: true }, { name: "plan", label: "Your plan for the year", type: "textarea", full: true }]} />}
              {mineApp && <p className="small-note">You applied for <b>{mineApp.position}</b>: advisor {mineApp.advisorStatus.toLowerCase()}, Societies Head {mineApp.headStatus.toLowerCase()}{mineApp.note ? ` — ${mineApp.note}` : ""}.</p>}
              {ph === "VOTING" && !voter && <p className="small-note">Only {e.voterScope === "SOCIETY" ? "the society's members" : e.voterScope === "DEPARTMENT" ? "students of the society's department" : "students"} vote in this election.</p>}
              {e.positions.map((pos) => {
                const xs = cs.filter(onBallot).filter((c) => c.position === pos).sort((a, b) => (showVotes ? b.votes - a.votes : 0));
                if (!xs.length || ph === "APPLY") return null;
                return (
                  <div key={pos} style={{ marginTop: 10 }}>
                    <b style={{ fontSize: 13.5 }}>{pos}</b>{myBallots.has(pos) && <span className="small-note"> · you voted</span>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8, marginTop: 4 }}>
                      {xs.map((c, i) => { const st = names.get(c.studentId); return (
                        <div key={c.id} style={{ border: "1px solid var(--line)", padding: 10, background: showVotes && i === 0 ? "rgba(46,157,91,.12)" : undefined }}>
                          <b>{st?.name}</b> <span className="small-note">{st?.rollNumber}</span>{showVotes && <b style={{ float: "right" }}>{c.votes} vote{c.votes === 1 ? "" : "s"}{i === 0 ? " · elected" : ""}</b>}
                          {c.videoUrl && <div><a href={c.videoUrl} target="_blank" rel="noreferrer" className="small-note">▶ Watch the 2-minute speech</a></div>}
                          <details style={{ marginTop: 4 }}><summary className="small-note" style={{ cursor: "pointer" }}>Message and plan</summary><div style={{ whiteSpace: "pre-wrap", fontSize: 12.5 }}>{c.manifesto}</div><div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 6 }}><b>Plan:</b> {c.plan}</div></details>
                          {ph === "VOTING" && voter && !myBallots.has(pos) && <div style={{ marginTop: 6 }}><ActionButton url={API} body={{ action: "vote", electionId: e.id, position: pos, candidateId: c.id }} label={`Vote for ${st?.name?.split(" ")[0] || "this candidate"}`} confirmText={`Vote for ${st?.name} as ${pos}? A vote can't be changed.`} /></div>}
                        </div>); })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }))}
      </div>
    </StudentShell>
  );
}
