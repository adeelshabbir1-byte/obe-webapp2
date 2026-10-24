import Link from "next/link";
import { sourcesFor } from "../../lib/regulations";

/** "Source" chips: the published clauses applied at these places, linking to the clause in the Regulations Library. */
export default async function Sources({ targets, warn = false, compact = false }: { targets: string[]; warn?: boolean; compact?: boolean }) {
  const m = await sourcesFor(targets).catch(() => new Map());
  const all = targets.flatMap((t) => m.get(t) || []).filter((x, i, a) => a.findIndex((y) => y.clauseId === x.clauseId) === i);
  if (!all.length) return warn ? <span className="small-note" style={{ color: "#B26A00" }} title="No published regulation is linked here yet">⚠ no source document</span> : null;
  return <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", verticalAlign: "middle" }}>{all.map((s) => <Link key={s.clauseId} href={`/regulations/${s.docId}#c-${s.clauseId}`} title={`${s.label} — ${s.ref}`} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, border: "1px solid #1565C0", color: "#1565C0", whiteSpace: "nowrap", textDecoration: "none" }}>📄 {compact ? s.ref : `${s.label.slice(0, 48)} · ${s.ref}`}</Link>)}</span>;
}
