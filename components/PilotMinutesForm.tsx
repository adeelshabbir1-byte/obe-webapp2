"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type R = { key: string; label: string; task: string; before: number | null; now: number | null };
export default function PilotMinutesForm({ rows }: { rows: R[] }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, { before: string; now: string }>>(Object.fromEntries(rows.map((r) => [r.key, { before: r.before === null ? "" : String(r.before), now: r.now === null ? "" : String(r.now) }])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setMsg(null);
    const r = await fetch("/api/pilot-figures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: v }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Could not save." });
    setMsg({ ok: true, text: "Saved." }); router.refresh();
  };
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Your minutes per task</h3>
      <p className="small-note">How long one task took before OBEHUB (paper files, spreadsheets, meetings) and how long it takes now. Ask the people who do the work; a fair average is enough. Leave blank what you have not measured.</p>
      <table style={{ fontSize: 13 }}><thead><tr><th>Area</th><th>Minutes before</th><th>Minutes now</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}><td>{r.label}<div className="small-note">per {r.task}</div></td>
            <td><input type="number" min={0} max={6000} value={v[r.key].before} onChange={(e) => setV({ ...v, [r.key]: { ...v[r.key], before: e.target.value } })} style={{ width: 90 }} data-before={r.key} /></td>
            <td><input type="number" min={0} max={6000} value={v[r.key].now} onChange={(e) => setV({ ...v, [r.key]: { ...v[r.key], now: e.target.value } })} style={{ width: 90 }} data-now={r.key} /></td></tr>))}</tbody></table>
      <button className="btn" onClick={save} style={{ marginTop: 8 }} data-save>Save minutes</button>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status">{msg.text}</div>}
    </div>
  );
}
