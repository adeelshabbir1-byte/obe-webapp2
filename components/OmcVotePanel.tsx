import { ActionButton, ActionForm } from "./fyp/FypClient";
import { voteView, stateOf, SE_STEPS, omcFinalNote, planChecks, checksLine } from "../lib/sePlan";
import { limitBreaches } from "../lib/omcRules";

// The OMC's vote on a Subject Expert's plan: each member approves or not with a comment; more than half carries it and
// the Convener confirms. Suggestions (per step / item, with reasons) go to the Subject Expert, round after round; if they
// don't settle, the Convener finalises the OMC's version (recorded for good on the plan, the course file and the reports).
export default async function OmcVotePanel({ courseId, me }: { courseId: string; me: string }) {
  const [v, st, note, checks, limits] = await Promise.all([voteView(courseId), stateOf(courseId), omcFinalNote(courseId), planChecks(courseId), limitBreaches(courseId, "SE").catch(() => [] as string[])]);
  if (!v || !st) return null;
  const member = v.members.some((m) => m.id === me), convener = v.convenerId === me;
  const waiting = st.status === "submitted";
  const mine = v.votes.find((x) => x.memberId === me);
  const api = `/api/omc/templates/${courseId}`;
  return (
    <>
      <div className="card" style={{ borderLeft: `5px solid ${st.approved ? "#2E7D32" : waiting ? "#1565C0" : "#B26A00"}` }}>
        <h3 style={{ fontSize: 14, marginTop: 0 }}>OMC decision{st.approved ? (st.finalisedByOmc ? " — finalised by the OMC" : " — OMC-approved") : waiting ? ` — round ${v.round}, waiting for votes` : ` — ${st.status.replace("-", " ")}`}</h3>
        {v.previous && <p style={{ fontSize: 13, margin: "0 0 6px" }}>Approved last semester for <b>{v.previous.batch}</b> by the OMC{v.previous.at ? ` (${new Date(v.previous.at).toLocaleDateString("en-GB")})` : ""}.</p>}
        <p style={{ fontSize: 13, margin: "0 0 6px" }}>{checksLine(checks)}</p>
        {limits.length > 0 && <p className="err">Outside the OMC&apos;s locked limits: {limits.join("; ")}.</p>}
        {note && <p style={{ fontSize: 13, fontWeight: 700, color: "#8D2B0B" }}>{note}</p>}
        <p style={{ fontSize: 13.5, margin: "6px 0" }}><b>Votes: {v.tally.yes} of {v.tally.total} approved</b>{v.tally.no ? ` · ${v.tally.no} not` : ""}{v.tally.waiting.length ? ` · waiting: ${v.tally.waiting.join(", ")}` : ""} · {v.tally.need} needed{v.convenerName ? ` · Convener ${v.convenerName}` : ""}</p>
        {v.votes.length > 0 && <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: "0 0 6px" }}>{v.votes.map((x) => <li key={x.memberId}>{x.name}: <b style={{ color: x.approve ? "#2E7D32" : "#C62828" }}>{x.approve ? "approve" : "not"}</b>{x.comment ? ` — ${x.comment}` : ""} <span className="small-note" style={{ margin: 0 }}>{new Date(x.at).toLocaleDateString("en-GB")}</span></li>)}</ul>}
        {member && waiting && <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton url={api} body={{ action: "vote", approve: true }} label={mine?.approve ? "Approve (again)" : "Approve"} askNote="Comment (optional)" showMessage />
          <ActionButton url={api} body={{ action: "vote", approve: false }} label="Do not approve" className="btn btn-secondary btn-sm" askNote="Why not? (shown to the OMC)" noteRequired showMessage />
        </span>}
        {convener && waiting && v.tally.carried && <div style={{ marginTop: 8 }}><ActionButton url={api} body={{ action: "confirm" }} label="Confirm — the plan is OMC-approved" className="btn" showMessage /></div>}
        {convener && !st.approved && v.suggestions.length > 0 && <div style={{ marginTop: 8 }}><ActionButton url={api} body={{ action: "finalise" }} label="Finalise the OMC's version" className="btn btn-secondary btn-sm" confirmText="Finalise the OMC's version of this plan? It will carry the note 'Finalised by the OMC, not the Subject Expert' for good, listing the points the Subject Expert did not accept." showMessage /></div>}
        {!member && <p className="small-note">Only the members of this course&apos;s OMC vote.</p>}
        {v.rounds.length > 1 && <p className="small-note">Rounds: {v.rounds.map((r) => `${r.round}: ${r.approvals} of ${r.votes} approving`).join(" · ")}</p>}
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, marginTop: 0 }}>Suggestions to the Subject Expert ({v.suggestions.length})</h3>
        {v.suggestions.length === 0 ? <p className="small-note">None yet.</p> : (
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Round</th><th>Step</th><th>Suggestion</th><th>Reason</th><th>Subject Expert</th></tr></thead>
            <tbody>{v.suggestions.map((s) => <tr key={s.id}><td>{s.round}</td><td>{SE_STEPS.find((x) => x.key === s.step)?.title || s.step}{s.item ? ` · ${s.item}` : ""}</td><td>{s.text}<br /><span className="small-note" style={{ margin: 0 }}>{s.byName}, {new Date(s.createdAt).toLocaleDateString("en-GB")}</span></td><td>{s.reason}</td><td>{s.status === "OPEN" ? "waiting" : <><b>{s.status === "ADDED" ? "added" : "replied"}</b>{s.reply ? ` — ${s.reply}` : ""}</>}</td></tr>)}</tbody></table>)}
        {member && !st.approved && <ActionForm url={api} fixed={{ action: "suggest" }} submit="Send to the Subject Expert" collapsed openLabel="+ Suggest a change" initial={{ step: "clos" }}
          fields={[{ name: "step", label: "Step", type: "select", options: SE_STEPS.map((x) => [x.key, x.title] as [string, string]) }, { name: "item", label: "Item (e.g. CLO-2, lecture 7)", width: 200 }, { name: "text", label: "Suggestion", type: "textarea", full: true }, { name: "reason", label: "Reason", type: "textarea", full: true }]} />}
      </div>
    </>
  );
}
