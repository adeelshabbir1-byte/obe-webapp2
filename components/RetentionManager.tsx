"use client";
import { useCallback, useEffect, useState } from "react";

type Data = { setting: { inactiveUserMonths: number | null; graduatedDetailYears: number | null }; preview: { users: number; students: number; marks: number; attendance: number } };

export default function RetentionManager({ superAdmin, institutes }: { superAdmin: boolean; institutes: { id: string; name: string }[] }) {
  const [cid, setCid] = useState(institutes[0]?.id || "");
  const [d, setD] = useState<Data | null>(null);
  const [months, setMonths] = useState("");
  const [years, setYears] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    if (!cid) return;
    const r = await fetch(`/api/privacy-retention?chairmanId=${cid}`); const x = await r.json();
    if (!r.ok) { setMsg(x.error || "Could not load."); return; }
    setD(x); setMonths(x.setting.inactiveUserMonths ? String(x.setting.inactiveUserMonths) : ""); setYears(x.setting.graduatedDetailYears ? String(x.setting.graduatedDetailYears) : "");
  }, [cid]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>) => { const r = await fetch("/api/privacy-retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chairmanId: cid, ...body }) }); const x = await r.json().catch(() => ({})); setMsg(r.ok ? (x.removed ? `Removed: ${x.removed.users} account(s) anonymised; ${x.removed.marks} mark and ${x.removed.attendance} attendance record(s) of ${x.removed.students} graduate(s).` : "Saved.") : x.error || "Failed."); if (r.ok) load(); };
  return (
    <div className="card">
      {superAdmin && <label style={{ display: "block", marginBottom: 10 }}>Institute <select value={cid} onChange={(e) => setCid(e.target.value)}>{institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>Inactive staff accounts: keep for <input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} placeholder="keep" style={{ width: 80 }} /> months</label>
        <label>Graduated students&apos; marks and attendance: keep for <input type="number" min={1} value={years} onChange={(e) => setYears(e.target.value)} placeholder="keep" style={{ width: 80 }} /> years</label>
        <button className="btn btn-sm" onClick={() => post({ inactiveUserMonths: months || null, graduatedDetailYears: years || null })}>Save</button>
      </div>
      <p className="small-note">Leave blank to keep for ever (the default).</p>
      {d && <div style={{ marginTop: 10 }}>
        <b>What this setting would remove now:</b>
        <ul style={{ fontSize: 13 }}>
          <li>{d.preview.users} inactive staff account(s) — anonymised (name, email and login removed; their records stay, attributed to &quot;Former staff member&quot;).</li>
          <li>{d.preview.students} graduate(s): {d.preview.marks} mark and {d.preview.attendance} attendance record(s) — transcripts and results stay.</li>
        </ul>
        {superAdmin ? (d.preview.users + d.preview.marks + d.preview.attendance > 0 && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type REMOVE" aria-label="Type REMOVE to confirm" />
          <button className="btn btn-sm" style={{ background: "#B3261E" }} disabled={confirm !== "REMOVE"} onClick={() => post({ apply: true, confirm })}>Remove what is listed above</button>
        </div>) : <p className="small-note">Only the Super Admin can remove data, after checking this list.</p>}
      </div>}
      {msg && <p className="small-note" role="status">{msg}</p>}
    </div>
  );
}
