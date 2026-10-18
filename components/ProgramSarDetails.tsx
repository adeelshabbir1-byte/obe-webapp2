"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The program's level, launch and approval dates, and the PEO × PLO alignment (NBEAC SAR Tables B, 2.1 and 2.4). */
export default function ProgramSarDetails({ degreeProgram, peos, plos, initial }: {
  degreeProgram: string; peos: string[]; plos: { number: number; title: string }[];
  initial: { programLevel: string | null; launchDate: string | null; academicCouncilDate: string | null; hecNocDate: string | null; peoPlo: Record<string, number[]> };
}) {
  const router = useRouter();
  const [v, setV] = useState({ programLevel: initial.programLevel || "", launchDate: initial.launchDate || "", academicCouncilDate: initial.academicCouncilDate || "", hecNocDate: initial.hecNocDate || "" });
  const [map, setMap] = useState<Record<string, number[]>>(initial.peoPlo);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (peo: string, n: number) => setMap((m) => { const cur = new Set(m[peo] || []); if (cur.has(n)) cur.delete(n); else cur.add(n); return { ...m, [peo]: Array.from(cur).sort((a, b) => a - b) }; });
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/coordinator/program-profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ degreeProgram, ...v, peoPlo: map }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: data.error || "Could not save." });
    if (res.ok) router.refresh();
  }
  const date = (k: keyof typeof v, label: string) => <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{label}<input type="date" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} /></label>;
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginTop: 0 }}>Accreditation details (NBEAC SAR)</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Program level
          <select value={v.programLevel} onChange={(e) => setV((x) => ({ ...x, programLevel: e.target.value }))}>
            <option value="">—</option><option value="UG16">Undergraduate (16-year)</option><option value="GRAD18">Graduate (18-year)</option><option value="PHD">Doctoral</option>
          </select>
        </label>
        {date("launchDate", "Program launch date")}
        {date("academicCouncilDate", "Academic Council approval")}
        {date("hecNocDate", "HEC NOC (if applicable)")}
      </div>
      <h4 style={{ margin: "16px 0 6px" }}>PEO × GA alignment</h4>
      {peos.length === 0 || plos.length === 0 ? <p className="small-note">Add the PEOs above{plos.length === 0 ? " and the batch's GAs" : ""} first.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>PEO</th>{plos.map((p) => <th key={p.number} title={p.title} style={{ textAlign: "center" }}>GA{p.number}</th>)}</tr></thead>
            <tbody>{peos.map((peo, i) => {
              const key = `PEO${i + 1}`;
              return (
                <tr key={key}>
                  <td title={peo}><b>{key}</b> <span className="small-note">{peo.slice(0, 60)}{peo.length > 60 ? "…" : ""}</span></td>
                  {plos.map((p) => <td key={p.number} style={{ textAlign: "center" }}><input type="checkbox" checked={(map[key] || []).includes(p.number)} onChange={() => toggle(key, p.number)} aria-label={`${key} served by GA${p.number}`} /></td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save accreditation details"}</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}
