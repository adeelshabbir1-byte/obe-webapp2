"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Tick batches / rooms / staff and move them to a campus. */
export default function CampusAssign({ kind, items, campuses }: { kind: string; items: { id: string; label: string; campus: string }[]; campuses: [string, string][] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [to, setTo] = useState(campuses[0]?.[0] || "main");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const name = new Map(campuses);
  const shown = items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  async function go() {
    const r = await fetch("/api/campuses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", kind, ids: Array.from(sel), campusId: to }) });
    const d = await r.json(); setMsg(r.ok ? d.message : d.error); if (r.ok) { setSel(new Set()); router.refresh(); }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} />
        <span className="small-note">{sel.size} ticked</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>{campuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn btn-sm" disabled={!sel.size} onClick={go}>Move to campus</button>
        {msg && <span className="small-note">{msg}</span>}
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #ddd", borderRadius: 4 }}>
        {shown.map((i) => <label key={i.id} style={{ display: "flex", gap: 8, padding: "3px 8px", fontSize: 13 }}><input type="checkbox" checked={sel.has(i.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(i.id); else n.delete(i.id); setSel(n); }} />{i.label} <span className="small-note">— {name.get(i.campus) || "Main campus"}</span></label>)}
      </div>
    </div>
  );
}
