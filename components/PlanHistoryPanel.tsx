import { historyOf, diff, REASONS, type PlanItem } from "../lib/planHistory";
import { ActionForm } from "./fyp/FypClient";

// A student's degree plan over time: the original plan vs now, every version and course move with its reason, and the
// student / advisor comments.
export default async function PlanHistoryPanel({ studentId, staff }: { studentId: string; staff: boolean }) {
  const h = await historyOf(studentId).catch(() => null);
  if (!h) return null;
  const first = h.versions[0] ? (JSON.parse(h.versions[0].itemsJson) as PlanItem[]) : null;
  const d = first ? diff(first, h.current) : null;
  const rl = (k: string | null) => REASONS.find(([x]) => x === k)?.[1] || "—";
  const body = { studentId };
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Plan history</h3>
      {first && d ? <div style={{ fontSize: 12.5 }}>
        <b>Original plan ({h.versions[0].kind.toLowerCase()} by {h.versions[0].byName}, {h.versions[0].at.toISOString().slice(0, 10)}) vs now:</b>{" "}
        {!d.moved.length && !d.added.length && !d.dropped.length ? "no change." : <>
          {d.moved.map((x) => <span key={x.courseId} style={{ marginRight: 10 }}>↔ {x.code} S{x.from} → S{x.sem}</span>)}
          {d.added.map((x) => <span key={x.courseId} style={{ marginRight: 10, color: "#1E6B34" }}>+ {x.code} (S{x.sem})</span>)}
          {d.dropped.map((x) => <span key={x.courseId} style={{ marginRight: 10, color: "#B3261E" }}>− {x.code}</span>)}
        </>}
      </div> : <p className="small-note" style={{ marginTop: 0 }}>A version is kept each time the plan is locked, unlocked or handed to a new advisor; the first one becomes the &quot;original plan&quot;.</p>}
      <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Timeline ({h.versions.length} versions, {h.moves.length} moves)</summary>
        <div style={{ display: "grid", gap: 4, marginTop: 6, fontSize: 12.5 }}>
          {[...h.versions.map((v) => ({ at: v.at, el: <div key={v.id}><b>{v.at.toISOString().slice(0, 10)}</b> — {v.kind === "HANDOVER" ? "Handed over" : v.kind === "LOCK" ? "Plan locked" : v.kind === "UNLOCK" ? "Plan unlocked" : "Version saved"} by {v.byName}{v.note ? `: ${v.note}` : ""} <span className="small-note">({(JSON.parse(v.itemsJson) as PlanItem[]).length} courses)</span></div> })),
            ...h.moves.map((m) => ({ at: m.at, el: <div key={m.id}>{m.at.toISOString().slice(0, 10)} — {m.code} {m.fromSem ? `S${m.fromSem} → ` : "planned in "}S{m.toSem} by {m.byName} · <i>{rl(m.reason)}</i>{m.note ? ` — ${m.note}` : ""}
              {staff && !m.reason && <ActionForm showMessage url="/api/plan-history" fixed={{ action: "reason", moveId: m.id, ...body }} submit="Save" collapsed openLabel="Add reason" fields={[{ name: "reason", label: "Reason", type: "select", options: REASONS.map(([k, l]) => [k, l] as [string, string]) }, { name: "note", label: "Note", width: 220 }]} />}</div> }))]
            .sort((a, b) => b.at.getTime() - a.at.getTime()).map((x) => x.el)}
          {!h.versions.length && !h.moves.length && <span className="small-note">Nothing recorded yet.</span>}
        </div>
      </details>
      <div style={{ marginTop: 10 }}>
        <b style={{ fontSize: 13 }}>Comments</b>
        {h.comments.map((c) => <div key={c.id} style={{ fontSize: 12.5, borderLeft: `3px solid ${c.byStudent ? "#1565C0" : "#8A5A0F"}`, paddingLeft: 8, margin: "6px 0" }}><b>{c.byName}</b> <span className="small-note">{c.byStudent ? "student" : "advisor / staff"} · {c.at.toISOString().slice(0, 16).replace("T", " ")}</span><div>{c.body}</div></div>)}
        <ActionForm showMessage url="/api/plan-history" fixed={{ action: "comment", ...body }} submit="Add comment" collapsed openLabel="Write a comment…" fields={[{ name: "body", label: "Comment", type: "textarea", full: true }]} />
      </div>
    </div>
  );
}
