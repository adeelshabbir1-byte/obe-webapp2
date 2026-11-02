"use client";
import { useState } from "react";

const post = (b: unknown) => fetch("/api/topic-resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
export function TopicResAdd({ courseId, lectureNumber }: { courseId: string; lectureNumber: number }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState({ title: "", url: "", kind: "VIDEO", note: "" }); const [m, setM] = useState("");
  if (!open) return <button type="button" className="btn-link" onClick={() => setOpen(true)} data-add-res={lectureNumber}>+ resource</button>;
  return <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
    <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="VIDEO">Video</option><option value="READING">Reading</option><option value="BOOK">Library book</option><option value="LINK">Web page</option><option value="EXERCISE">Exercise</option></select>
    <input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
    <input placeholder="https://… (optional for a book)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} style={{ minWidth: 200 }} />
    <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ courseId, lectureNumber, ...f }); if (!r.ok) setM(r.d.error || "Not saved."); else location.reload(); }}>Add</button><span className="small-note">{m}</span>
  </div>;
}
export function TopicResRemove({ courseId, id }: { courseId: string; id: string }) {
  return <button type="button" className="btn-link" onClick={async () => { if (confirm("Remove this resource?")) { await post({ action: "remove", courseId, id }); location.reload(); } }} aria-label="Remove">×</button>;
}
