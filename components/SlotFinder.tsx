"use client";

import { useState } from "react";

// Smart free-slot finder: choose batches, see when they are all free — or the times that would move the fewest classes.
type B = { id: string; label: string };
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
export default function SlotFinder({ batches }: { batches: B[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [length, setLength] = useState(1);
  const [rank, setRank] = useState(false);
  const [res, setRes] = useState<{ day: string; start: number; end: number; affected: string[] }[] | null>(null);
  const [err, setErr] = useState("");
  async function go() {
    setErr("");
    const r = await fetch("/api/scheduling", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "slots", batchIds: sel, length, rank }) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
    setRes(j.slots);
  }
  return (
    <div className="card" data-testid="slot-finder">
      <b>Find a time</b>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>{batches.map((b) => <label key={b.id} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={sel.includes(b.id)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, b.id] : x.filter((y) => y !== b.id)))} />{b.label}</label>)}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Hours <input type="number" min={0.5} max={8} step={0.5} value={length} onChange={(e) => setLength(Number(e.target.value))} style={{ width: 60 }} /></label>
        <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={rank} onChange={(e) => setRank(e.target.checked)} />Recommend times that move the fewest classes</label>
        <button type="button" className="btn btn-brass btn-sm" disabled={!sel.length} onClick={go}>Find</button>
        {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
      </div>
      {res && (
        <div style={{ marginTop: 6, fontSize: 13 }} data-testid="slot-results">
          {!res.length && <p className="small-note">No common free time — tick “recommend” to see the least disruptive times.</p>}
          {res.slice(0, 40).map((s, i) => <span key={i} style={{ display: "inline-block", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 6px", margin: 2, background: s.affected.length ? "#FFF8E6" : "#EAF5EE" }}>{s.day} {hh(s.start)}–{hh(s.end)}{s.affected.length ? ` · moves ${s.affected.join(", ")}` : ""}</span>)}
        </div>
      )}
    </div>
  );
}
