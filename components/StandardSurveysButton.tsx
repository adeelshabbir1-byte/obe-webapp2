"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function StandardSurveysButton({ batches }: { batches: [string, string][] }) {
  const router = useRouter(); const [b, setB] = useState(batches[0]?.[0] || ""); const [msg, setMsg] = useState("");
  async function go() { const r = await fetch("/api/coordinator/surveys/standard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: b }) }); const d = await r.json().catch(() => ({})); setMsg(r.ok ? (d.made ? `Created ${d.made} forms.` : "These forms already exist.") : d.error || "Failed."); if (r.ok) router.refresh(); }
  if (!batches.length) return null;
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><select value={b} onChange={(e) => setB(e.target.value)}>{batches.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button type="button" className="btn btn-sm" onClick={go}>Create the 4 standard forms</button><span style={{ fontSize: 13 }}>{msg}</span></div>;
}
