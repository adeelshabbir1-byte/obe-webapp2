"use client";

import { useState } from "react";

type Proposal = { key: string; kind: string; rowId: string; label: string; batchLabel: string; instructorId: string; instructorName: string; sections: number; score: number; reasons: string[] };
type Load = { id: string; name: string; capacity: number; assigned: number; wish: { maxSections: number | null; remarks: string; updatedAt: string } | null; designation: string; specialization: string; unavailable: string };
type Data = { term: string; prev: string; lastYear: string; keepExisting: boolean; proposals: Proposal[]; loads: Load[]; unfilled: number; hiring?: Hiring };
type Hiring = { unfilledSections: number; spareSections: number; fteNeeded: number; rows: { label: string; batch: string; sections: number; area: string }[]; thin: { label: string; area: string; only: string }[]; areas: { area: string; sections: number; courses: number; thin: number; experts: number }[]; advice: string[] };

/** The suggested allocation: preferences, times taught, last semester and last year, within each teacher's load. */
export default function AutoAllocation({ onApplied }: { onApplied?: () => void }) {
  const [keep, setKeep] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function suggest() {
    setBusy("suggest"); setMsg("");
    const res = await fetch(`/api/assigner/auto-allocate?keep=${keep ? 1 : 0}`);
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(d.error || "Could not work out a suggestion."); return; }
    setData(d); setPicked(new Set((d as Data).proposals.map((p) => p.key)));
  }
  async function apply() {
    if (!data) return;
    if (!data.keepExisting && !confirm("This replaces the current section counts of the chosen courses. Continue?")) return;
    setBusy("apply"); setMsg("");
    const res = await fetch("/api/assigner/auto-allocate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: Array.from(picked), keepExisting: data.keepExisting }) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(d.error || "Could not apply."); return; }
    setMsg(`${d.applied} allocation${d.applied === 1 ? "" : "s"} applied. Review and adjust them in the Section Count Matrix.`);
    setData(null); onApplied?.();
  }
  const flip = (k: string) => { const n = new Set(picked); if (n.has(k)) n.delete(k); else n.add(k); setPicked(n); };

  return (
    <div>
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          OBEHUB scores each teacher for each section: stated priority (top 40, good 25, fifty-fifty 10); times taught, their own figure or the
          record here (4 a time, up to 20); taught it last semester (+15) or this term last year (+20); students&apos; rating of them on the course
          (4+/5: +10, 3.5+: +5, under 3: −10); specialization match (+12 on electives, +6 otherwise); seniority to settle close calls (Professor +5 …
          Lecturer +1); and a nudge to keep a course with one teacher and spread different courses around. A teacher never goes above their wished
          sections, their normal load less outside load, or what their free hours (My Availability) can hold. Courses with the fewest willing
          teachers are filled first; what nobody can take goes to Visiting Faculty. Nothing changes until you apply — then edit the matrix as usual.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep allocations already made (fill only the sections still open)</label>
          <button type="button" className="btn btn-brass btn-sm" disabled={!!busy} onClick={suggest}>{busy === "suggest" ? "Working it out…" : data ? "Suggest again" : "Suggest allocation"}</button>
        </div>
        {msg && <p className="small-note" style={{ margin: "8px 0 0" }}>{msg}</p>}
      </div>
      {data && (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <b>{data.term}: {data.proposals.reduce((a, p) => a + p.sections, 0)} section{data.proposals.length === 1 ? "" : "s"} suggested{data.unfilled ? ` · ${data.unfilled} left to Visiting Faculty` : ""}</b>
              <span className="small-note">Compared with {data.prev} (last semester) and {data.lastYear} (same term last year)</span>
            </div>
            {data.proposals.length === 0 ? <p className="small-note">Every section already has a teacher.</p> : (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ fontSize: 12.5 }}>
                  <thead><tr><th><input type="checkbox" aria-label="All" checked={picked.size === data.proposals.length} onChange={(e) => setPicked(e.target.checked ? new Set(data.proposals.map((p) => p.key)) : new Set())} /></th><th>Course</th><th>Batch</th><th>Teacher</th><th style={{ textAlign: "center" }}>Sections</th><th>Why</th></tr></thead>
                  <tbody>
                    {data.proposals.map((p) => (
                      <tr key={p.key} style={{ background: p.score === 0 ? "rgba(214,69,69,.08)" : undefined }}>
                        <td><input type="checkbox" checked={picked.has(p.key)} onChange={() => flip(p.key)} aria-label={`Apply ${p.label} to ${p.instructorName}`} /></td>
                        <td>{p.label}</td>
                        <td className="small-note">{p.batchLabel}</td>
                        <td><b>{p.instructorName}</b></td>
                        <td style={{ textAlign: "center" }}>{p.sections}</td>
                        <td className="small-note">{p.reasons.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.proposals.length > 0 && <div style={{ marginTop: 10 }}><button type="button" className="btn btn-brass btn-sm" disabled={!!busy || picked.size === 0} onClick={apply}>{busy === "apply" ? "Applying…" : `Apply ${picked.size} line${picked.size === 1 ? "" : "s"}`}</button></div>}
          </div>
          {data.hiring && (data.hiring.unfilledSections > 0 || data.hiring.thin.length > 0) && (
            <div className="card" style={{ overflowX: "auto" }}>
              <b style={{ fontSize: 13 }}>Hiring gaps — {data.hiring.unfilledSections} section(s) without a teacher{data.hiring.fteNeeded ? ` · about ${data.hiring.fteNeeded} faculty to hire` : ""} · {data.hiring.spareSections} section(s) of room left in the pool</b>
              <ul style={{ fontSize: 12.5, margin: "6px 0" }}>{data.hiring.advice.map((a, i) => <li key={i}>{a}</li>)}</ul>
              {data.hiring.areas.length > 0 && (
                <table style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Area (weak first)</th><th style={{ textAlign: "center" }}>Open sections</th><th style={{ textAlign: "center" }}>Courses</th><th style={{ textAlign: "center" }}>One-teacher courses</th><th style={{ textAlign: "center" }}>Specialists</th></tr></thead>
                  <tbody>{data.hiring.areas.map((a) => <tr key={a.area}><td>{a.area}</td><td style={{ textAlign: "center" }}>{a.sections}</td><td style={{ textAlign: "center" }}>{a.courses}</td><td style={{ textAlign: "center" }}>{a.thin}</td><td style={{ textAlign: "center", color: a.experts === 0 ? "#c93c3c" : undefined }}>{a.experts}</td></tr>)}</tbody>
                </table>
              )}
              {data.hiring.rows.length > 0 && <p className="small-note" style={{ margin: "6px 0 0" }}>Hire for: {data.hiring.rows.map((r) => `${r.label} (${r.sections})`).join(" · ")}</p>}
              {data.hiring.thin.length > 0 && <p className="small-note" style={{ margin: "4px 0 0" }}>Single-teacher courses: {data.hiring.thin.map((r) => `${r.label} — ${r.only}`).join(" · ")}</p>}
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            <b style={{ fontSize: 13 }}>Teachers&apos; load after this suggestion</b>
            <table style={{ fontSize: 12.5, marginTop: 6 }}>
              <thead><tr><th>Teacher</th><th>Rank · specialization</th><th style={{ textAlign: "center" }}>Sections</th><th style={{ textAlign: "center" }}>Room</th><th>Unavailable</th><th>Their wish / remarks</th></tr></thead>
              <tbody>
                {data.loads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td className="small-note">{[l.designation, l.specialization].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: l.assigned > l.capacity ? "#c93c3c" : l.assigned === 0 ? "var(--slate)" : undefined }}>{l.assigned} / {l.capacity}</td>
                    <td style={{ textAlign: "center" }}>{Math.max(0, l.capacity - l.assigned)}</td>
                    <td className="small-note">{l.unavailable || "—"}</td>
                    <td className="small-note">{l.wish ? `${l.wish.maxSections != null ? `wants ${l.wish.maxSections} section(s)` : ""}${l.wish.remarks ? `${l.wish.maxSections != null ? " · " : ""}${l.wish.remarks}` : ""} (${l.wish.updatedAt})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
