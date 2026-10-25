import Link from "next/link";
import { prisma } from "../lib/db";
import { SE_STEPS, planChecks, stateOf, voteView, seDeadline, omcFinalNote } from "../lib/sePlan";
import { limitBreaches } from "../lib/omcRules";
import { ActionButton } from "./fyp/FypClient";

// The Subject Expert's plan, step by step, on the existing course pages: 1 Course details · 2 CLOs · 3 Lecture plan ·
// 4 Assessment plan · 5 Midterm & final questions · 6 Review and submit to OMC. Shows the OMC's votes, its suggestions
// (to add or answer with reasons), the recheck warning on a plan approved for the previous batch, and the permanent note
// when the OMC finalised the plan itself.
const TAB_STEP: Record<string, number> = { clos: 1, schedule: 3, weights: 4, "paper-distribution": 5, instruments: 6 };

export default async function SePlanStrip({ courseId, active }: { courseId: string; active: string }) {
  const [checks, st, votes, due, finalNote, breaches] = await Promise.all([planChecks(courseId), stateOf(courseId), voteView(courseId).catch(() => null), seDeadline(courseId), omcFinalNote(courseId), limitBreaches(courseId, "SE").catch(() => [] as string[])]);
  if (!st) return null;
  const submitted = st.status === "submitted" || st.status === "approved";
  const done: Record<string, boolean> = { ...checks, review: submitted };
  const here = TAB_STEP[active] || 0;
  const href = (n: number) => `/subjectexpert/courses/${courseId}/${SE_STEPS[n - 1].tab}${n === 1 ? "#details" : n === 2 ? "#clos" : n === 6 ? "#submit" : ""}`;
  const firstOpen = SE_STEPS.findIndex((s) => !done[s.key]) + 1 || 6;
  const next = here && here < 6 ? (here === 1 ? 2 : here + 1) : null;
  const open = votes?.suggestions.filter((s) => s.status === "OPEN") || [];
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectExpertId: true } });
  return (
    <div className="card no-print" role="navigation" aria-label="Course plan steps" style={{ borderLeft: `5px solid ${st.approved ? "#2E7D32" : "#0D2A4A"}`, padding: "10px 14px", marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>Course plan · {here ? `step ${here === 1 ? "1–2" : here} of 6` : `${SE_STEPS.filter((s) => done[s.key]).length} of 6 done`}</b>
        <span className="small-note" style={{ margin: 0 }}>{st.approved ? (st.finalisedByOmc ? "Finalised by the OMC" : "OMC-approved") : st.status === "submitted" ? "with the OMC" : st.status === "changes-requested" ? "the OMC suggests changes" : st.status === "reopened" ? "reopened for changes" : "draft"}{!st.approved && due ? ` · due ${new Date(due).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
      </div>
      <ol style={{ display: "flex", gap: 4, listStyle: "none", padding: 0, margin: "8px 0", flexWrap: "wrap" }}>{SE_STEPS.map((s, i) => { const n = i + 1; const on = here === n || (here === 1 && n === 2); return (
        <li key={s.key}><Link href={href(n)} aria-current={on ? "step" : undefined} title={s.what} style={{ display: "inline-flex", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 12, textDecoration: "none", border: `1.5px solid ${on ? "#0D2A4A" : done[s.key] ? "#2E7D32" : "#C9CED6"}`, background: on ? "#EAF1FA" : done[s.key] ? "#EEF7EF" : "#fff", color: done[s.key] ? "#1E6B34" : "#0D2A4A", fontWeight: on ? 700 : 500 }}><span aria-hidden>{done[s.key] ? "✓" : on ? "●" : "○"}</span>{n}<span className="setup-strip-title"> {s.title}</span></Link></li>); })}</ol>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {here > 1 && <Link className="btn btn-secondary btn-sm" href={href(here === 3 ? 2 : here - 1)}>← Previous step</Link>}
        {next && <Link className="btn btn-sm" href={href(next)}>Next step →</Link>}
        {!here && <Link className="btn btn-sm" href={href(firstOpen)}>Go to step {firstOpen} →</Link>}
      </div>
      {st.carried && !st.carried.rechecked && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "#FFF8E1", border: "1px solid #F3D27A", borderRadius: 6, fontSize: 13 }}>
          <b>Approved for {st.carried.from}{st.carried.at ? ` (${new Date(st.carried.at).toLocaleDateString("en-GB")})` : ""} — please recheck for this batch.</b> It counts as approved. If nothing needs to change, say so; any change goes to the OMC again (ask for a template change).{" "}
          {c?.subjectExpertId && <ActionButton url={`/api/subjectexpert/courses/${courseId}/plan-flow`} body={{ action: "recheck" }} label="Rechecked — no change" />}
        </div>
      )}
      {finalNote && <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#8D2B0B" }}>{finalNote}</p>}
      {breaches.length > 0 && <p className="err" style={{ marginTop: 8 }}>Outside the OMC&apos;s locked limits: {breaches.join("; ")}.</p>}
      {votes && (st.status === "submitted" || votes.votes.length > 0) && !st.approved && (
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>Votes (round {votes.round}): {votes.tally.yes} of {votes.tally.total} approved{votes.tally.no ? ` · ${votes.tally.no} not` : ""}{votes.tally.waiting.length ? ` · waiting: ${votes.tally.waiting.join(", ")}` : ""}</p>
      )}
      {votes && votes.suggestions.length > 0 && (
        <details id="omc" open={open.length > 0} style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>The OMC&apos;s suggestions ({open.length} to answer · {votes.suggestions.length} in all, over {Math.max(1, new Set(votes.suggestions.map((s) => s.round)).size)} round(s))</summary>
          <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Round</th><th>Step</th><th>Suggestion</th><th>Reason</th><th>Your answer</th></tr></thead>
            <tbody>{votes.suggestions.map((s) => <tr key={s.id}><td>{s.round}</td><td>{SE_STEPS.find((x) => x.key === s.step)?.title || s.step}{s.item ? ` · ${s.item}` : ""}</td><td>{s.text}<br /><span className="small-note" style={{ margin: 0 }}>{s.byName}</span></td><td>{s.reason}</td>
              <td>{s.status === "OPEN" ? (c?.subjectExpertId ? <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}><ActionButton url={`/api/subjectexpert/courses/${courseId}/plan-flow`} body={{ action: "answer", suggestionId: s.id, added: true }} label="Added" askNote="Note (optional)" /><ActionButton url={`/api/subjectexpert/courses/${courseId}/plan-flow`} body={{ action: "answer", suggestionId: s.id, added: false }} label="Reply" className="btn btn-secondary btn-sm" askNote="Your reason" noteRequired /></span> : "waiting") : <><b>{s.status === "ADDED" ? "added" : "replied"}</b>{s.reply ? ` — ${s.reply}` : ""}</>}</td></tr>)}</tbody></table>
        </details>
      )}
    </div>
  );
}
