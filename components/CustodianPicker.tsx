"use client";

import { useState } from "react";

type Candidate = { id: string; name: string; role: string };

export default function CustodianPicker({ candidates, currentCustodianId }: { candidates: Candidate[]; currentCustodianId: string | null }) {
  const [selected, setSelected] = useState(currentCustodianId || "");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/chairman/alumni-custodian", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selected || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Alumni & Employer Data Custodian</h3>
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        Any faculty member can submit alumni or employer records, but one designated person reviews and approves
        or rejects every submission before it's used (e.g. for surveys). Pick that person here.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 260 }}>
          <option value="">— None assigned —</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role.replace("_", " ")})</option>)}
        </select>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
