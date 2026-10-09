"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TabbedCards from "./TabbedCards";
import { EVIDENCE } from "../lib/evidence";

export type EvRow = { id: string; area: string; kind: string; title: string; organization: string | null; date: string | null; count: number | null; target: number | null; actual: number | null };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;

function Section({ def, rows }: { def: (typeof EVIDENCE)[number]; rows: EvRow[]; "data-tab"?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ kind: def.kinds[0], title: "", organization: "", date: "", count: "", target: "", actual: "", notes: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const isKpi = def.showTarget && f.kind === "KPI";
  async function add() {
    setMsg("");
    const res = await fetch("/api/coordinator/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, area: def.area }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Added." : d.error || "Something went wrong");
    if (res.ok) { setF({ ...f, title: "", organization: "", count: "", target: "", actual: "", notes: "" }); router.refresh(); }
  }
  async function remove(id: string) {
    if (!confirm("Remove this record?")) return;
    const res = await fetch(`/api/coordinator/evidence?id=${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }
  return (
    <div className="card" data-tab={def.tab} style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>{def.heading}</h3>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>{def.help}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Type<br /><select style={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{def.kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>{isKpi ? "Indicator" : "Title"}<br /><input style={{ ...input, width: 230 }} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        {def.showOrg && <label style={{ fontSize: 12 }}>{def.area === "PEO" ? "Who took part" : "Organisation"}<br /><input style={{ ...input, width: 180 }} value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></label>}
        <label style={{ fontSize: 12 }}>Date<br /><input style={input} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        {def.showCount && <label style={{ fontSize: 12 }}>{def.showCount}<br /><input style={{ ...input, width: 80 }} type="number" min={0} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></label>}
        {isKpi && <>
          <label style={{ fontSize: 12 }}>Target<br /><input style={{ ...input, width: 90 }} type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>Actual<br /><input style={{ ...input, width: 90 }} type="number" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} /></label>
        </>}
        <button className="btn" onClick={add}>Add</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
      {rows.length === 0 ? <p style={{ color: "var(--slate)" }}>Nothing recorded yet.</p> : (
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Title</th>{def.showOrg && <th>{def.area === "PEO" ? "Who" : "Organisation"}</th>}{def.showCount && <th>{def.showCount}</th>}{def.showTarget && <th>Target / actual</th>}<th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{fmt(r.date)}</td><td>{r.kind}</td><td>{r.title}</td>
              {def.showOrg && <td>{r.organization || "—"}</td>}{def.showCount && <td>{r.count ?? "—"}</td>}
              {def.showTarget && <td>{r.kind === "KPI" ? `${r.target ?? "—"} / ${r.actual ?? "—"}` : "—"}</td>}
              <td><button className="btn" style={{ fontSize: 12 }} onClick={() => remove(r.id)}>Remove</button></td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export default function EvidenceManager({ rows }: { rows: EvRow[] }) {
  return <TabbedCards>{EVIDENCE.map((d) => <Section key={d.area} data-tab={d.tab} def={d} rows={rows.filter((r) => r.area === d.area)} />)}</TabbedCards>;
}
