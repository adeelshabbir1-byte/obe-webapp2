"use client";

import { useState } from "react";

export type AttendancePolicyForm = {
  minPercentage: number; lateCountsPresent: boolean; excusedExcluded: boolean; warnMarginPct: number;
  qrPresentMinutes: number; qrLateMinutes: number; qrRotateSeconds: number;
};

export default function AttendanceThresholdForm({ initial }: { initial: AttendancePolicyForm }) {
  const [v, setV] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof AttendancePolicyForm>(k: K, val: AttendancePolicyForm[K]) => { setV((x) => ({ ...x, [k]: val })); setOk(false); };

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/omc/attendance-threshold", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }
  const n = (k: keyof AttendancePolicyForm, label: string, min: number, max: number, unit = "") => (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input type="number" min={min} max={max} value={String(v[k])} onChange={(e) => set(k, Number(e.target.value) as never)} style={{ width: 90 }} />
        {unit && <span style={{ fontSize: 12, color: "var(--slate)" }}>{unit}</span>}
      </span>
    </div>
  );

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Attendance policy</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        Students below the minimum are flagged in each course&apos;s attendance, warned on their portal, and reported to their Program Lead and advisor. Defaults to 75%.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        {n("minPercentage", "Minimum %", 1, 100, "%")}
        {n("warnMarginPct", "Warn when within", 0, 30, "% of the minimum")}
      </div>
      <div style={{ display: "grid", gap: 6, margin: "14px 0", fontSize: 13 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={v.lateCountsPresent} onChange={(e) => set("lateCountsPresent", e.target.checked)} /> A late arrival counts as attended</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={v.excusedExcluded} onChange={(e) => set("excusedExcluded", e.target.checked)} /> An excused absence (leave) is not held against the student — it is left out of the percentage</label>
      </div>
      <h4 style={{ fontSize: 13, margin: "4px 0 8px" }}>QR attendance — defaults for each session</h4>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        {n("qrPresentMinutes", "Present for the first", 1, 90, "minutes")}
        {n("qrLateMinutes", "Late until, then closed", 1, 180, "minutes")}
        {n("qrRotateSeconds", "New code every", 10, 30, "seconds")}
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--slate)", margin: "10px 0 0" }}>Instructors can change the minutes for a session when they start it.</p>
    </div>
  );
}
