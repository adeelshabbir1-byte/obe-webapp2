"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OVERALL: [string, string][] = [["OUTSTANDING", "Outstanding"], ["VERY_GOOD", "Very good"], ["GOOD", "Good"], ["NEEDS_IMPROVEMENT", "Needs improvement"], ["UNSATISFACTORY", "Unsatisfactory"]];
const AREAS: [string, string, string][] = [
  ["teaching", "Teaching quality", "Delivery, assessment, rubric use, student feedback"],
  ["research", "Research & development", "Publications, grants, projects, training"],
  ["service", "Service & administration", "Duties, committees, invigilation, deadlines"],
  ["conduct", "Professional conduct", "Punctuality, cooperation, integrity"],
];
const SCALE = ["", "1 Poor", "2 Fair", "3 Good", "4 Very good", "5 Excellent"];

export function AppraisalForm({ userId, year, status, initial }: { userId: string; year: number; status: string; initial: { ratings: Record<string, number>; studentFeedback: number | null; overall: string | null; strengths: string; improve: string; goals: string } }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, studentFeedback: initial.studentFeedback ?? "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const final = status === "FINAL";
  async function go(action: string) {
    if (action === "finalise" && !confirm("Sign off this appraisal? It can only be changed by reopening it.")) return;
    setBusy(action); setMsg(null);
    const r = await fetch("/api/appraisals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, year, ...f, action }) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setMsg({ ok: false, t: d.error || "Could not save." }); return; }
    setMsg({ ok: true, t: action === "share" ? "Shared with the teacher." : action === "finalise" ? "Signed off." : action === "reopen" ? "Reopened." : "Saved." });
    router.refresh();
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Reviewer&apos;s appraisal</h3>
      {msg && <p className={msg.ok ? "" : "err"} style={msg.ok ? { background: "#E8F3EC", color: "#1F5E36", padding: "8px 12px", fontSize: 13 } : undefined}>{msg.t}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {AREAS.map(([k, label, hint]) => (
          <div key={k} className="field"><label>{label}</label>
            <select disabled={final} value={f.ratings[k] || ""} onChange={(e) => setF({ ...f, ratings: { ...f.ratings, [k]: Number(e.target.value) } })}>
              <option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{SCALE[n]}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>{hint}</div>
          </div>
        ))}
        <div className="field"><label>Student feedback score (1–5)</label><input disabled={final} type="number" step="0.1" min={1} max={5} value={f.studentFeedback} onChange={(e) => setF({ ...f, studentFeedback: e.target.value })} placeholder="from course evaluation forms" /></div>
        <div className="field"><label>Overall rating</label>
          <select disabled={final} value={f.overall || ""} onChange={(e) => setF({ ...f, overall: e.target.value || null })}><option value="">—</option>{OVERALL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
      </div>
      {([["strengths", "Strengths"], ["improve", "Areas to improve"], ["goals", "Goals for next year"]] as const).map(([k, l]) => (
        <div key={k} className="field"><label>{l}</label><textarea disabled={final} rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!final && <button className="btn" disabled={!!busy} onClick={() => go("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button>}
        {status === "DRAFT" && <button className="btn btn-brass" disabled={!!busy} onClick={() => go("share")}>Share with the teacher</button>}
        {status === "SHARED" && <button className="btn btn-brass" disabled={!!busy} onClick={() => go("finalise")}>Sign off (final)</button>}
        {final && <button className="btn" disabled={!!busy} onClick={() => go("reopen")}>Reopen</button>}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Sharing freezes the year&apos;s figures shown above, so the teacher reads exactly what you judged on.</p>
    </div>
  );
}

export function AppraisalReply({ year, comment, acknowledged }: { year: number; comment: string; acknowledged: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(comment);
  const [busy, setBusy] = useState(false);
  async function send(ack: boolean) {
    setBusy(true);
    await fetch("/api/appraisals/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, comment: c, acknowledge: ack }) });
    setBusy(false); router.refresh();
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Your reply</h3>
      <textarea rows={4} value={c} onChange={(e) => setC(e.target.value)} placeholder="Anything you want on record — context, disagreement, support you need." style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" disabled={busy} onClick={() => send(false)}>Save comment</button>
        {!acknowledged && <button className="btn btn-brass" disabled={busy} onClick={() => send(true)}>I have read my appraisal</button>}
        {acknowledged && <span className="badge badge-ok">Acknowledged</span>}
      </div>
    </div>
  );
}
