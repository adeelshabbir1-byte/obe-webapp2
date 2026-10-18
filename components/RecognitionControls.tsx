"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const METRICS: [string, string][] = [["COURSE_FILES", "Course files kept"], ["RESULTS_APPROVED", "Course results approved"], ["CLOS_MAPPED", "Courses with every CLO mapped to a GA"], ["MARKS_COMPLETE", "Courses with all marks entered"], ["CQI_DONE", "Courses with CQI done where CLOs fell short"]];
async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const, d } : { ok: false as const, error: d.error || "Something went wrong." };
}

/** A goal's progress bar: green once it reaches the target, red when the date has passed short of it. */
export function GoalBar({ title, done, total, pct, target, due }: { title: string; done: number; total: number; pct: number; target: number; due: string }) {
  const late = new Date(due) < new Date() && pct < target;
  const c = pct >= target ? "var(--sage)" : late ? "var(--rust)" : "var(--brass)";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <b>{title}</b><span style={{ color: late ? "var(--rust)" : "var(--slate)" }}>{done} of {total} · {pct}% (target {target}% by {new Date(due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</span>
      </div>
      <div style={{ position: "relative", height: 12, background: "#EEE8E6", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: c, borderRadius: 6 }} />
        <div style={{ position: "absolute", left: `${target}%`, top: -2, bottom: -2, width: 2, background: "var(--ink)", opacity: 0.5 }} title={`target ${target}%`} />
      </div>
    </div>
  );
}

export function GoalForm() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", metric: "COURSE_FILES", targetPct: 100, dueDate: new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10) });
  const [err, setErr] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="field" style={{ flex: "1 1 220px" }}><label>Goal</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="All course files complete by week 6" /></div>
      <div className="field"><label>Measured by</label><select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label>Target %</label><input type="number" min={1} max={100} value={f.targetPct} onChange={(e) => setF({ ...f, targetPct: Number(e.target.value) })} style={{ width: 80 }} /></div>
      <div className="field"><label>By</label><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
      <button className="btn btn-brass" style={{ marginBottom: 14 }} onClick={async () => { const r = await send("/api/recognition/goals", "POST", f); if (!r.ok) setErr(r.error); else { setErr(""); setF({ ...f, title: "" }); router.refresh(); } }}>Add goal</button>
      {err && <span style={{ color: "var(--rust)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}

export function RemoveButton({ url, label = "Remove" }: { url: string; label?: string }) {
  const router = useRouter();
  return <button className="act act-danger" onClick={async () => { if (!confirm("Remove it?")) return; await send(url, "DELETE"); router.refresh(); }}>{label}</button>;
}

export function RecogniseForm({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ userId: "", title: "", reason: "" });
  const [msg, setMsg] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="field"><label>Teacher</label><select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Recognition</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Workshop Leader" list="rec-titles" />
        <datalist id="rec-titles"><option value="Workshop Leader" /><option value="Committee Star" /><option value="Research Grant" /><option value="Mentor of the Semester" /><option value="Student Favourite" /></datalist></div>
      <div className="field" style={{ flex: "1 1 240px" }}><label>For</label><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ran the OBE rubric workshop for 30 faculty" /></div>
      <button className="btn btn-brass" style={{ marginBottom: 14 }} disabled={!f.userId || f.title.trim().length < 3} onClick={async () => { const r = await send("/api/recognition/badges", "POST", f); setMsg(r.ok ? "Given." : r.error); if (r.ok) { setF({ userId: "", title: "", reason: "" }); router.refresh(); } }}>Recognise</button>
      {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
    </div>
  );
}

export function AwardSemester({ term }: { term: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span>
      <button className="btn btn-brass" disabled={busy} onClick={async () => { if (!confirm(`Give ${term}'s badges now to everyone who has earned them? Usually done at the end of the semester. Safe to repeat.`)) return; setBusy(true); const r = await send("/api/recognition/award-semester", "POST"); setBusy(false); setMsg(r.ok ? `${r.d.given} badge(s) given.` : r.error); router.refresh(); }}>{busy ? "Working…" : `Give ${term} badges`}</button>
      {msg && <span style={{ marginLeft: 8, fontSize: 12.5 }}>{msg}</span>}
    </span>
  );
}
