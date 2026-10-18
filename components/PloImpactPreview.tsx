"use client";
import { useState } from "react";

type D = { plo: number; before: number | null; after: number | null };
export function DeltaList({ deltas }: { deltas: D[] }) {
  if (!deltas.length) return <span style={{ color: "var(--slate)" }}>This course is not weighted on any GA of the batch.</span>;
  return <>{deltas.map((d) => { const diff = d.before != null && d.after != null ? Math.round((d.after - d.before) * 10) / 10 : null; return (
    <span key={d.plo} style={{ display: "inline-block", marginRight: 12 }}>GA-{d.plo}: <b style={{ color: diff == null ? undefined : diff >= 0 ? "#1F5E36" : "#B3261E" }}>{diff == null ? "—" : `${diff >= 0 ? "+" : ""}${diff}%`}</b> <span style={{ color: "var(--slate)", fontSize: 11.5 }}>({d.before ?? "—"} → {d.after ?? "—"})</span></span>); })}</>;
}

export default function PloImpactPreview({ courseId }: { courseId: string }) {
  const [d, setD] = useState<D[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() { setBusy(true); const r = await fetch(`/api/instructor/courses/${courseId}/plo-preview`); const j = await r.json().catch(() => ({})); setBusy(false); setD(j.deltas || []); }
  return d ? <DeltaList deltas={d} /> : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={load}>{busy ? "Calculating…" : "Show the effect on the batch's GAs"}</button>;
}
