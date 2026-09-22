"use client";

import { useState } from "react";

export default function AttendanceThresholdForm({ initial }: { initial: number }) {
  const [pct, setPct] = useState(String(initial));
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/omc/attendance-threshold", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minPercentage: pct }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Minimum Attendance %</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        Students below this percentage are flagged in each course's Attendance Summary. Defaults to 75%.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Minimum %</label>
          <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 90 }} />
        </div>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
