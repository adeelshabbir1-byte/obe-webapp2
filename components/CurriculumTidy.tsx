"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; oldName: string; owner: string; named: boolean; code: string; level: string; programCode: string; programName: string; discipline: string; dup: boolean };

/** Proposed standard names for every curriculum: edit any cell, untick what to leave alone, apply in one go. */
export default function CurriculumTidy({ rows: initial, levels, disciplines }: { rows: Row[]; levels: string[]; disciplines: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [on, setOn] = useState<Set<string>>(new Set(initial.filter((r) => !r.named).map((r) => r.id)));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const dupCodes = useMemo(() => { const c = new Map<string, number>(); rows.forEach((r) => c.set(r.code, (c.get(r.code) || 0) + 1)); return c; }, [rows]);
  const set = (id: string, k: keyof Row, v: string) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: k === "code" || k === "programCode" ? v.toUpperCase() : v } : r)));
  async function apply() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/curricula-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk", rows: rows.filter((x) => on.has(x.id)).map(({ id, code, level, programCode, programName, discipline }) => ({ id, code, level, programCode, programName, discipline })) }) });
    const d = await r.json().catch(() => ({})); setBusy(false); setMsg(r.ok ? d.message : d.error || "Failed."); if (r.ok) router.refresh();
  }
  const inp = { fontSize: 12, padding: "3px 5px" } as const;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn btn-sm" disabled={busy || !on.size} onClick={apply}>{busy ? "Saving…" : `Apply to ${on.size} curricula`}</button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOn(new Set(rows.map((r) => r.id)))}>Tick all</button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOn(new Set())}>Untick all</button>
        {msg && <b style={{ fontSize: 13 }}>{msg}</b>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th></th><th>Now</th><th>Owner</th><th>Code</th><th>Level</th><th>Program code</th><th>Program name</th><th>Discipline</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} style={{ background: (dupCodes.get(r.code) || 0) > 1 ? "#FDE2E2" : undefined }}>
              <td><input type="checkbox" checked={on.has(r.id)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(r.id); else n.delete(r.id); setOn(n); }} aria-label={`Rename ${r.oldName}`} /></td>
              <td>{r.oldName}{r.named && <div className="small-note">already named</div>}</td>
              <td className="small-note">{r.owner}</td>
              <td><input style={{ ...inp, width: 170, fontFamily: "ui-monospace, Consolas, monospace" }} value={r.code} onChange={(e) => set(r.id, "code", e.target.value)} />{(dupCodes.get(r.code) || 0) > 1 && <div style={{ color: "#C62828", fontSize: 11 }}>same code twice — duplicate upload?</div>}</td>
              <td><select style={inp} value={r.level} onChange={(e) => set(r.id, "level", e.target.value)}>{levels.map((l) => <option key={l}>{l}</option>)}</select></td>
              <td><input style={{ ...inp, width: 70 }} value={r.programCode} onChange={(e) => set(r.id, "programCode", e.target.value)} /></td>
              <td><input style={{ ...inp, width: 200 }} value={r.programName} onChange={(e) => set(r.id, "programName", e.target.value)} /></td>
              <td><select style={inp} value={r.discipline} onChange={(e) => set(r.id, "discipline", e.target.value)}>{disciplines.map((l) => <option key={l}>{l}</option>)}</select></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
