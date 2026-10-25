import { planState, OMC_FINAL_NOTE } from "../lib/planVote";
import { ActionButton, ActionForm } from "./fyp/FypClient";

// The plan's approval panel: for OMC members the vote ("Votes: 2 of 5 approved · 1 not · waiting: A, B"), "approved
// before for …", suggestions and the Convener's confirm / finalise; for the Subject Expert the suggestions with
// "Added" / "Reply with reason", and on a synced plan the "please recheck" warning with "Rechecked — no change".
export default async function PlanVotePanel({ courseId, viewerId, viewerRole }: { courseId: string; viewerId: string; viewerRole: string }) {
  const st = await planState(courseId);
  if (!st) return null;
  const member = st.com.all.includes(viewerId) || viewerRole === "OMC";
  const se = st.c.subjectExpertId === viewerId;
  const convener = st.com.convenerId === viewerId;
  const approved = st.ps?.status === "APPROVED" || st.c.templateStatus === "approved";
  const suggestions = st.thread.filter((t) => !t.parentId);
  const url = "/api/plan-vote";
  return (
    <div className="card" style={{ borderLeft: `5px solid ${approved ? "#2E7D32" : "#1565C0"}` }}>
      <h3 style={{ marginTop: 0 }}>OMC approval {st.round > 1 ? `· round ${st.round}` : ""}</h3>
      {st.ps?.omcFinal && <p style={{ color: "#B3261E", fontWeight: 600 }}>⚑ {st.ps.finalNote || OMC_FINAL_NOTE}</p>}
      {st.synced && <p style={{ background: "#FFF6E0", padding: 8, borderRadius: 6, fontSize: 13 }}>Counts as approved — it is linked by content sync to an approved plan. {st.ps?.recheckedAt ? `Rechecked, no change (${new Date(st.ps.recheckedAt).toLocaleDateString("en-GB")}).` : "Subject Expert: please recheck it for this batch."}
        {se && !st.ps?.recheckedAt && <> <ActionButton url={url} body={{ action: "recheck", courseId }} label="Rechecked — no change" className="btn btn-sm" /></>}</p>}
      {st.before.length > 0 && <p className="small-note">Approved before for {st.before.join(", ")}.</p>}
      <p style={{ fontSize: 13 }}><b>Votes: {st.yes} of {st.total} approved</b>{st.no ? ` · ${st.no} not` : ""}{st.waiting.length && !approved ? ` · waiting: ${st.waiting.join(", ")}` : ""}{approved ? " · approved" : ""}</p>
      {st.votes.length > 0 && <ul style={{ fontSize: 12.5, marginTop: 0 }}>{st.votes.map((v) => <li key={v.userId}>{v.userName}: {v.approve ? "approves" : "does not approve"}{v.comment ? ` — ${v.comment}` : ""}</li>)}</ul>}
      {member && !approved && st.com.all.includes(viewerId) && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <ActionButton url={url} body={{ action: "vote", courseId, approve: true }} label="Approve" className="btn btn-sm" />
        <ActionButton url={url} body={{ action: "vote", courseId, approve: false }} label="Do not approve" askNote="What should the Subject Expert change?" noteRequired className="btn btn-secondary btn-sm" />
        <ActionForm url={url} fixed={{ action: "suggest", courseId }} collapsed openLabel="Send a suggestion" submit="Send" fields={[{ name: "step", label: "Part", type: "select", options: [["CLOs", "CLOs"], ["Lecture plan", "Lecture plan"], ["Assessment plan", "Assessment plan"], ["Mid / final questions", "Mid / final questions"], ["Other", "Other"]] }, { name: "text", label: "Suggestion", type: "textarea", full: true }]} />
      </div>}
      {member && !approved && !st.com.all.includes(viewerId) && <p className="small-note">You are not on the OMC of this course&apos;s home department, so you cannot vote here.</p>}
      {convener && !approved && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <ActionButton url={url} body={{ action: "confirm", courseId }} label={st.canConfirm ? "Confirm — approve the plan" : `Confirm (needs a majority: ${st.yes} of ${st.total})`} className="btn" />
        <ActionButton url={url} body={{ action: "finalise", courseId }} label="Finalise by the OMC" askNote={`Not settled with the Subject Expert? The plan will carry "${OMC_FINAL_NOTE}". Note (optional):`} className="btn btn-secondary" />
      </div>}
      {suggestions.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>Suggestions</b>
        {suggestions.map((t) => { const replies = st.thread.filter((r) => r.parentId === t.id); return (
          <div key={t.id} style={{ fontSize: 12.5, borderTop: "1px solid #eee", padding: "6px 0" }}>
            <div><b>{t.byName}</b> (round {t.round}{t.step ? ` · ${t.step}` : ""}): {t.text}</div>
            {replies.map((r) => <div key={r.id} style={{ marginLeft: 16, color: r.kind === "ADDED" ? "#2E7D32" : "#333" }}>↳ {r.byName}: {r.kind === "ADDED" ? "✓ Added. " : ""}{r.text}</div>)}
            {se && !approved && !replies.length && <div style={{ marginLeft: 16, display: "flex", gap: 6, marginTop: 4 }}>
              <ActionButton url={url} body={{ action: "reply", courseId, parentId: t.id, kind: "ADDED" }} label="Added" className="btn btn-sm" />
              <ActionButton url={url} body={{ action: "reply", courseId, parentId: t.id, kind: "REPLY" }} label="Reply with reason" askNote="Why not?" noteRequired className="btn btn-secondary btn-sm" />
            </div>}
          </div>); })}
        {se && !approved && <p className="small-note">After adding the suggestions, submit the plan again — that opens a new round of votes.</p>}
      </div>}
    </div>
  );
}
