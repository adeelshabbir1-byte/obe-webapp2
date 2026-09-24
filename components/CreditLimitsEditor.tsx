"use client";

import { useState, useEffect } from "react";

export default function CreditLimitsEditor() {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/coordinator/credit-limits").then((r) => r.json()).then((data) => {
      setMin(data.minCreditsPerSemester?.toString() || "");
      setMax(data.maxCreditsPerSemester?.toString() || "");
      setLoaded(true);
    });
  }, []);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/coordinator/credit-limits", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minCreditsPerSemester: min, maxCreditsPerSemester: max }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      setSaved(true); setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  if (!loaded) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Semester Credit Load Limits</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Used by the student-facing Degree Planner to flag a semester plan that's over- or under-loaded.
        Leave blank to use the built-in default (12–18 credit hours).
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Minimum</label>
          <input value={min} onChange={(e) => setMin(e.target.value)} type="number" min={0} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: 80 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Maximum</label>
          <input value={max} onChange={(e) => setMax(e.target.value)} type="number" min={0} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: 80 }} />
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brass" style={{ fontSize: 12.5 }}>{saving ? "Saving…" : "Save"}</button>
        {saved && <span style={{ fontSize: 12, color: "var(--sage)" }}>Saved.</span>}
      </div>
    </div>
  );
}
