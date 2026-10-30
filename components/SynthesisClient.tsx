"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES, type Picks } from "../lib/synthesisCore";

// The hybrid synthesizer: pick the base (description + CLOs), each 4-week module of lectures, the lab plan, the
// assessment split and the books — each from any proposal (or the current course). Every change is checked at once.

type P = { id: string; author: string };
export function Synthesizer({ masterCourseId, proposals, canApply }: { masterCourseId: string; proposals: P[]; canApply: boolean }) {
  const router = useRouter();
  const all = [{ id: "CURRENT", author: "Current course" }, ...proposals];
  const [picks, setPicks] = useState<Picks>({ base: "CURRENT", modules: ["CURRENT", "CURRENT", "CURRENT", "CURRENT"], lab: "CURRENT", assessments: "CURRENT", books: "CURRENT" });
  const [res, setRes] = useState<{ checks: { ok: boolean; pct: number; issues: string[] }; result: { clos: { statement: string }[]; topics: { n: number; topic: string }[]; assessments: { type: string; pct: number }[]; books: { title: string }[] }; locked: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function call(action: string) {
    const r = await fetch("/api/synthesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, masterCourseId, picks }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  useEffect(() => { call("preview").then(setRes).catch((e) => setMsg({ ok: false, text: e.message })); }, [JSON.stringify(picks)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = (label: string, value: string, set: (v: string) => void) => (
    <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{label}<select value={value} onChange={(e) => set(e.target.value)}>{all.map((p) => <option key={p.id} value={p.id}>{p.author}</option>)}</select></label>
  );
  return (
    <div className="card" data-testid="synthesizer">
      <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Synthesize the final course</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {sel("Base structure (description, CLOs)", picks.base, (v) => setPicks((p) => ({ ...p, base: v })))}
        {MODULES.map(([label], i) => <span key={label}>{sel(label, picks.modules[i], (v) => setPicks((p) => ({ ...p, modules: p.modules.map((m, k) => (k === i ? v : m)) })))}</span>)}
        {sel("Lab plan", picks.lab, (v) => setPicks((p) => ({ ...p, lab: v })))}
        {sel("Assessment weights", picks.assessments, (v) => setPicks((p) => ({ ...p, assessments: v })))}
        {sel("Reference books", picks.books, (v) => setPicks((p) => ({ ...p, books: v })))}
      </div>
      {res && (
        <div style={{ marginTop: 8 }} data-testid="synthesis-checks">
          <b style={{ color: res.checks.ok ? "#2F7A4D" : "#B3261E" }}>{res.checks.ok ? `✓ Compliant (${res.checks.pct}%)` : `✗ ${res.checks.issues.length} problem(s)`}</b>{res.locked ? <span className="small-note"> · HEC Golden Copy guardrails apply</span> : null}
          {res.checks.issues.map((i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B3261E" }}>{i}</p>)}
          <p className="small-note" style={{ margin: "4px 0" }}>{res.result.clos.length} CLOs · {res.result.topics.length} lectures (L9: {res.result.topics.find((t) => t.n === 9)?.topic || "—"}) · assessments {res.result.assessments.map((a) => `${a.type} ${a.pct}%`).join(", ") || "—"} · text book {res.result.books[0]?.title || "—"}</p>
        </div>
      )}
      {canApply && <button type="button" className="btn btn-brass btn-sm" disabled={!res?.checks.ok} onClick={async () => { try { const j = await call("apply"); setMsg({ ok: true, text: j.message }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }}>Apply to the master course</button>}
      {msg && <p className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
    </div>
  );
}
