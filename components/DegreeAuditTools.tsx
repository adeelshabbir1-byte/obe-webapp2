"use client";
import { useState } from "react";
const post = (b: unknown) => fetch("/api/degree-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
export function MinCgpa({ value }: { value: number }) {
  const [v, setV] = useState(String(value)); const [m, setM] = useState("");
  return <span style={{ fontSize: 13 }}>Minimum CGPA to graduate <input type="number" step="0.01" min="0" max="4" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 70 }} /> <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "mincgpa", value: v }); setM(r.error || "Saved ✓"); }}>Save</button> <span className="small-note">{m}</span></span>;
}
export function WarnButton({ batchId }: { batchId: string }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn btn-sm btn-secondary" onClick={async () => { const r = await post({ action: "warn", batchId }); setM(r.error || `Sent to ${r.sent} student(s) and the adviser ✓`); }}>Send early warnings</button> <span className="small-note">{m}</span></span>;
}
