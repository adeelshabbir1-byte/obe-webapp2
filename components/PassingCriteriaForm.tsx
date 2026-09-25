"use client";

import { useState, useEffect } from "react";

type Version = { id: string; cloPassingPct: number; ploPassingPct: number; effectiveFromTerm: string; effectiveFromYear: number };

export default function PassingCriteriaForm() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [cloPct, setCloPct] = useState("50");
  const [ploPct, setPloPct] = useState("50");
  const [effectiveFromTerm, setEffectiveFromTerm] = useState("Fall");
  const [effectiveFromYear, setEffectiveFromYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/omc/passing-criteria");
    const data = await res.json();
    setVersions(data.versions || []);
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/omc/passing-criteria", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloPassingPct: cloPct, ploPassingPct: ploPct, effectiveFromTerm, effectiveFromYear }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
      await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (!loaded) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>CLO / PLO Passing Criteria</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        A student needs at least this % of a CLO's (or PLO's) maximum weighted marks to count as having attained
        it — used everywhere pass/fail is shown: Result Mate, CLO/PLO Pass Rates, Program Attainment Analytics,
        and student transcripts. Versioned by semester, the same way the Grading Scale is: a new version applies
        from its effective term onward, without changing what already applied to earlier terms.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}

      {versions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Existing versions</p>
          {versions.map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <span>Effective from {v.effectiveFromTerm} {v.effectiveFromYear}</span>
              <span>CLO {v.cloPassingPct}% / PLO {v.ploPassingPct}%</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Add or update a version</p>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ margin: 0 }}>
          <label>CLO Passing %</label>
          <input type="number" min={1} max={100} value={cloPct} onChange={(e) => setCloPct(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>PLO Passing %</label>
          <input type="number" min={1} max={100} value={ploPct} onChange={(e) => setPloPct(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Effective From Term</label>
          <select value={effectiveFromTerm} onChange={(e) => setEffectiveFromTerm(e.target.value)}>
            <option value="Fall">Fall</option>
            <option value="Spring">Spring</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Effective From Year</label>
          <input type="number" value={effectiveFromYear} onChange={(e) => setEffectiveFromYear(e.target.value)} style={{ width: 100 }} />
        </div>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
