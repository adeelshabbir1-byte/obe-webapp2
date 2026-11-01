"use client";

import { useState } from "react";

// One editable scoped setting: the levels this person may change (institute / department / program).
export default function ScopedEdit({ k, levels, unit, min, max }: { k: string; levels: { scope: string; label: string; value: string }[]; unit?: string; min?: number; max?: number }) {
  const [vals, setVals] = useState(Object.fromEntries(levels.map((l) => [l.scope, l.value])));
  const [msg, setMsg] = useState("");
  async function save(scope: string, clear = false) {
    setMsg("");
    const r = await fetch("/api/settings/scoped", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k, scope, value: clear ? null : vals[scope] }) }).then((x) => x.json()).catch(() => ({ error: "Could not save." }));
    if (r.error) setMsg(r.error); else location.reload();
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
      {levels.map((l) => (
        <span key={l.scope} style={{ fontSize: 12.5 }}>
          {l.label}: <input type="number" min={min} max={max} value={vals[l.scope]} onChange={(e) => setVals({ ...vals, [l.scope]: e.target.value })} style={{ width: 64, fontSize: 12.5 }} /> {unit}{" "}
          <button type="button" className="btn btn-sm" onClick={() => save(l.scope)}>Save</button>{" "}
          {l.value !== "" && <button type="button" className="btn-link small-note" onClick={() => save(l.scope, true)} title="Use the level above">Clear</button>}
        </span>
      ))}
      {msg && <span style={{ color: "#B3261E", fontSize: 12.5 }}>{msg}</span>}
    </div>
  );
}
