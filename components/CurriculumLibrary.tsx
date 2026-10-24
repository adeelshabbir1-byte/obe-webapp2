"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { LibItem } from "../lib/curriculumLibraryData";

const FILTERS: [keyof LibItem, string][] = [["kind", "Owner type"], ["owner", "Owner / authority"], ["discipline", "Discipline"], ["level", "Level"], ["programName", "Program"], ["status", "Status"]];
const KIND_COLOR: Record<string, string> = { National: "#1565C0", "Your university's": "#7A2E3B", "University (yours)": "#2E7D32", University: "#6B7177" };

/** The curriculum library: filters on the left, one card per program with its versions (newest first). */
export default function CurriculumLibrary({ items, canTidy }: { items: LibItem[]; canTidy: boolean }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [old, setOld] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const shown = useMemo(() => items.filter((i) => FILTERS.every(([k]) => !f[k as string] || String(i[k]) === f[k as string]) && (!q || `${i.code} ${i.name} ${i.title} ${i.notificationNo || ""}`.toLowerCase().includes(q.toLowerCase())) && (old || i.status !== "SUPERSEDED")), [items, f, q, old]);
  const groups = useMemo(() => {
    const m = new Map<string, LibItem[]>();
    for (const i of shown) { const k = `${i.level} ${i.programName} · ${i.owner}`; m.set(k, (m.get(k) || []).concat(i)); }
    return Array.from(m.entries()).map(([k, xs]) => [k, xs.sort((a, b) => b.version.localeCompare(a.version))] as const).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);
  const opts = (k: keyof LibItem) => Array.from(new Set(items.map((i) => String(i[k] ?? "")).filter(Boolean))).sort();
  const unnamed = items.filter((i) => !i.named).length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", gap: 16 }} className="lib-grid">
      <style>{`@media (max-width: 760px) { .lib-grid { grid-template-columns: 1fr !important; } }`}</style>
      <aside className="card" style={{ margin: 0, alignSelf: "start", display: "grid", gap: 10 }}>
        <input placeholder="Search code, name, notification…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search curricula" />
        {FILTERS.map(([k, l]) => (
          <label key={k as string} style={{ fontSize: 12.5 }}>{l}<br />
            <select value={f[k as string] || ""} onChange={(e) => setF({ ...f, [k as string]: e.target.value })} style={{ width: "100%" }}><option value="">All</option>{opts(k).map((o) => <option key={o}>{o}</option>)}</select></label>
        ))}
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} /> Show superseded versions</label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setF({}); setQ(""); }}>Clear filters</button>
        {canTidy && <Link className="btn btn-brass btn-sm" href="/curricula/builder">Curriculum Builder</Link>}
        {canTidy && <Link className="btn btn-sm" href="/curricula/tidy">Name &amp; tidy up{unnamed ? ` (${unnamed} unnamed)` : ""}</Link>}
        {pick.length === 2 ? <Link className="btn btn-brass btn-sm" href={`/curricula/compare?a=${pick[0]}&b=${pick[1]}`}>Compare the two</Link> : <span className="small-note">Tick two versions to compare them.</span>}
      </aside>
      <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
        <div className="small-note">{shown.length} curricula in {groups.length} programs</div>
        {groups.map(([k, xs]) => (
          <div key={k} className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <b style={{ fontSize: 16 }}>{xs[0].level} {xs[0].programName}</b>
              <span style={{ fontSize: 12, fontWeight: 700, color: KIND_COLOR[xs[0].kind] || "#555" }}>{xs[0].kind} · {xs[0].owner} · {xs[0].discipline}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 12.5, marginTop: 6, width: "100%" }}>
                <thead><tr><th></th><th>Code</th><th>Version</th><th>Effective from</th><th>Courses</th><th>Credit hours</th><th>GAs</th><th>Used by</th><th></th></tr></thead>
                <tbody>{xs.map((i, n) => (
                  <tr key={i.id} style={{ opacity: i.status === "SUPERSEDED" ? 0.6 : 1 }}>
                    <td><input type="checkbox" aria-label={`Compare ${i.code}`} checked={pick.includes(i.id)} onChange={(e) => setPick(e.target.checked ? [...pick.slice(-1), i.id] : pick.filter((x) => x !== i.id))} /></td>
                    <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontWeight: 700 }}>{i.code}{!i.named && <span title="Proposed — not saved yet" style={{ color: "#B26A00" }}> *</span>}</td>
                    <td>{i.version}{n === 0 && i.status !== "SUPERSEDED" ? <span style={{ color: "#2E7D32", fontWeight: 700 }}> latest</span> : null}{i.status !== "PUBLISHED" ? ` (${i.status.toLowerCase()})` : ""}</td>
                    <td>{i.effective || "—"}</td><td>{i.courses}</td><td>{i.credits}</td><td>{i.gas}</td>
                    <td className="small-note">{i.batches} batch(es){i.institutes ? `, ${i.institutes} institute(s)` : ""}{i.copies ? `, ${i.copies} copy(ies)` : ""}</td>
                    <td><Link href={`/curricula/${i.id}`}>Open</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ))}
        {!groups.length && <div className="card small-note">No curriculum matches these filters.</div>}
      </section>
    </div>
  );
}
