"use client";

import { useState } from "react";

type Profile = { departmentIntro: string | null; departmentVision: string | null; departmentMission: string | null; peos: string[] };

export default function ProgramProfileForm({ degreeProgram, initial }: { degreeProgram: string; initial: Profile }) {
  const [peos, setPeos] = useState<string[]>(initial.peos.length > 0 ? initial.peos : [""]);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  function updatePeo(i: number, value: string) {
    setPeos((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }
  function addPeo() { setPeos((prev) => [...prev, ""]); }
  function removePeo(i: number) { setPeos((prev) => prev.filter((_, idx) => idx !== i)); }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setOk(false); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/program-profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degreeProgram,
          departmentIntro: fd.get("departmentIntro"), departmentVision: fd.get("departmentVision"),
          departmentMission: fd.get("departmentMission"), peos: peos.filter((p) => p.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="field"><label>Department Introduction</label><textarea name="departmentIntro" defaultValue={initial.departmentIntro || ""} rows={4} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
        <div className="field"><label>Department Vision</label><textarea name="departmentVision" defaultValue={initial.departmentVision || ""} rows={2} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
        <div className="field"><label>Department Mission</label><textarea name="departmentMission" defaultValue={initial.departmentMission || ""} rows={3} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 6 }}>Program Education Objectives (PEOs)</label>
        {peos.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, minWidth: 60, paddingTop: 6 }}>PEO {i + 1}</span>
            <textarea value={p} onChange={(e) => updatePeo(i, e.target.value)} rows={2} style={{ flex: 1, padding: 8, border: "1px solid var(--line)" }} />
            <button type="button" onClick={() => removePeo(i)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addPeo} style={{ background: "none", border: "1px dashed var(--line)", padding: "4px 10px", fontSize: 11.5, cursor: "pointer", marginBottom: 14 }}>+ Add PEO</button>
        <br />
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
