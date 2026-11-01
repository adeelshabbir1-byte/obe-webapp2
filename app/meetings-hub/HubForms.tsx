"use client";

import { useState } from "react";

const post = (b: unknown) => fetch("/api/meetings-hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export function Btn({ body, label, done }: { body: unknown; label: string; done?: string }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn btn-sm" onClick={async () => { const r = await post(body); setM(r.error || done || "Done ✓"); }}>{label}</button> {m && <span className="small-note">{m}</span>}</span>;
}
export function Suggest({ committeeId }: { committeeId: string }) {
  const [s, setS] = useState<{ day: string; start: number; end: number; rooms: string[] }[] | null>(null);
  return <span>{s ? <span className="small-note">{s.length ? s.map((x) => `${x.day.slice(0, 3)} ${hh(x.start)}–${hh(x.end)} (${x.rooms[0]})`).join(" · ") : "No common free time this week."}</span> : <button type="button" className="btn-link small-note" onClick={async () => setS((await post({ action: "suggest", committeeId })).slots || [])}>Suggest times</button>}</span>;
}
export function ActionForm({ committeeId, members }: { committeeId: string; members: { id: string; name: string }[] }) {
  const [t, setT] = useState(""); const [o, setO] = useState(""); const [d, setD] = useState(""); const [m, setM] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Action item" style={{ width: 200 }} />
      <select value={o} onChange={(e) => setO(e.target.value)}><option value="">Owner…</option>{members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
      <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "addAction", committeeId, title: t, ownerId: o, due: d }); setM(r.error || "Added ✓"); if (!r.error) setT(""); }}>Add</button> {m}
    </span>
  );
}
export function TemplateForm({ committeeId, sections, signatures, footer }: { committeeId?: string; sections: string[]; signatures: string[]; footer: string }) {
  const [s, setS] = useState(sections.join("\n")); const [g, setG] = useState(signatures.join(", ")); const [f, setF] = useState(footer); const [m, setM] = useState("");
  const save = async (reset = false) => { const r = await post({ action: "template", committeeId, reset, sections: s.split("\n").map((x) => x.trim()).filter(Boolean), signatures: g.split(",").map((x) => x.trim()).filter(Boolean), footer: f }); setM(r.error || (reset ? "Reset to the institute default ✓" : "Saved ✓ — applies to future minutes only")); };
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12.5, maxWidth: 520 }}>
      <label>Standard sections (one per line)<textarea rows={3} value={s} onChange={(e) => setS(e.target.value)} /></label>
      <label>Signature lines (comma-separated)<input value={g} onChange={(e) => setG(e.target.value)} /></label>
      <label>Footer<input value={f} onChange={(e) => setF(e.target.value)} /></label>
      <span><button type="button" className="btn btn-sm" onClick={() => save()}>Save</button> {committeeId && <button type="button" className="btn-link" onClick={() => save(true)}>Reset to institute default</button>} {m}</span>
    </div>
  );
}
