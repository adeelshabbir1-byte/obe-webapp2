"use client";

import { useEffect, useState } from "react";
import { putAssignSe } from "../../../lib/assignSeClient";

type Row = { code: string; title: string; semester: number | null; ids: string[]; batches: string[]; seId: string | null };
type Load = Record<string, { total: number; byProgram: Record<string, number>; codes: string[] }>;
// Matrix of the HOD's home courses × his department's experts, with each expert's live SE load (Adeel prompt §35).
export default function HodSeMatrix({ rows: initial, experts }: { rows: Row[]; experts: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(initial);
  const [loads, setLoads] = useState<Load>({});
  const [limit, setLimit] = useState(3);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pull = () => fetch("/api/se-load").then((r) => r.json()).then((d) => { if (d.loads) { setLoads(d.loads); setLimit(d.limit || 3); } }).catch(() => null);
  useEffect(() => { pull(); const t = setInterval(() => document.visibilityState === "visible" && pull(), 8000); return () => clearInterval(t); }, []);
  const tone = (n: number) => (n > limit ? "#B3261E" : n === limit ? "#B26A00" : "#1B6B3A");
  async function assign(r: Row, seId: string) {
    setBusy(true); setMsg("");
    const box: { reason?: string | null } = {};
    for (const id of r.ids) {
      const { ok, data } = await putAssignSe(id, seId || null, box);
      if (!ok) { setMsg(`${r.code}: ${data.error || "could not save"}`); setBusy(false); return; }
    }
    setRows((x) => x.map((y) => (y.code === r.code ? { ...y, seId: seId || null } : y)));
    await pull(); setBusy(false);
  }
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {msg && <div className="err">{msg}</div>}
      <table className="table" style={{ fontSize: 12.5, minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Course</th><th>Copies</th>
            {experts.map((e) => { const n = loads[e.id]?.total || 0; return <th key={e.id} title={(loads[e.id]?.codes || []).join(", ") || "No SE courses"} style={{ fontSize: 11.5 }}>{e.name}<div style={{ color: tone(n), fontWeight: 700 }}>SE of {n}{n > limit ? " ⛔" : n === limit ? " ⚠" : ""}</div></th>; })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td><b>{r.code}</b> {r.title}{!r.seId && <span style={{ color: "#B3261E" }}> · SE not named ⚠</span>}</td>
              <td title={r.batches.join(", ")} style={{ textAlign: "center" }}>{r.ids.length}</td>
              {experts.map((e) => (
                <td key={e.id} style={{ textAlign: "center" }}>
                  <input type="radio" name={`se-${r.code}`} checked={r.seId === e.id} disabled={busy} onChange={() => assign(r, e.id)} aria-label={`${e.name} as SE of ${r.code}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small-note">Limit {limit} SE courses per person (Who Decides What). Going over asks for a reason.</p>
    </div>
  );
}
