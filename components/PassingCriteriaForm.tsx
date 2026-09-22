"use client";

import { useState } from "react";

export default function PassingCriteriaForm({ initial }: { initial: { cloPassingPct: number; ploPassingPct: number } }) {
  const [cloPct, setCloPct] = useState(String(initial.cloPassingPct));
  const [ploPct, setPloPct] = useState(String(initial.ploPassingPct));
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/omc/passing-criteria", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloPassingPct: cloPct, ploPassingPct: ploPct }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>CLO / PLO Passing Criteria</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        A student needs at least this % of a CLO's (or PLO's) maximum weighted marks to count as having attained
        it — used everywhere pass/fail is shown: Result Mate, CLO/PLO Pass Rates, Program Attainment Analytics,
        and student transcripts. Defaults to 50% for both.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label>CLO Passing %</label>
          <input type="number" min={1} max={100} value={cloPct} onChange={(e) => setCloPct(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>PLO Passing %</label>
          <input type="number" min={1} max={100} value={ploPct} onChange={(e) => setPloPct(e.target.value)} style={{ width: 90 }} />
        </div>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
