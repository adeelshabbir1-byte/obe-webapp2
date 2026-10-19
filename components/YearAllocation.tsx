"use client";

import { useState } from "react";

type Row = { code: string; title: string; batch: string; students: number; sections: number; projected: boolean; teachers: { name: string; n: number }[]; open: number };
type Term = { label: string; summer: boolean; rows: Row[]; loads: { name: string; n: number; cap: number }[]; open: number };
type Data = { terms: Term[]; hire: { code: string; title: string; sections: number; terms: string[] }[]; fteNeeded: number };

/** Fall + Spring + Summer at once: forecast offerings, section counts and suggested teachers. Read-only — a plan to agree on early. */
export default function YearAllocation() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState(0);
  async function load() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/assigner/full-year");
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setMsg(j.error || "Could not load."); else setD(j);
  }
  return (
    <div>
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          The whole year before courses are offered: each running batch&apos;s courses for the semester it will be in, the expected new intake on
          today&apos;s curriculum (size = average of recent intakes), and summer classes where 5 or more students still have to repeat a course.
          Sections = students / 50. Teachers are proposed from priorities and times taught within their load (2 sections in summer).
        </p>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={load}>{busy ? "Working it out…" : d ? "Refresh" : "Plan the full year"}</button>
        {msg && <p className="small-note">{msg}</p>}
      </div>
      {d && (
        <>
          <div className="card">
            <b style={{ fontSize: 13 }}>Year summary</b>
            <p style={{ fontSize: 12.5, margin: "4px 0" }}>{d.terms.map((t) => `${t.label}: ${t.rows.reduce((a, r) => a + r.sections, 0)} sections, ${t.open} open`).join(" · ")}</p>
            {d.hire.length > 0 ? <p style={{ fontSize: 12.5, margin: 0 }}><b>Hire for (about {d.fteNeeded} faculty):</b> {d.hire.slice(0, 20).map((h) => `${h.code} ${h.title} — ${h.sections} section(s), ${h.terms.join("/")}`).join(" · ")}</p> : <p className="small-note">Every forecast section has a willing teacher.</p>}
          </div>
          <div role="tablist" className="tabs" style={{ marginBottom: 8 }}>
            {d.terms.map((t, i) => <button key={t.label} type="button" role="tab" className="tab" aria-selected={tab === i} onClick={() => setTab(i)}>{t.label}{t.open ? ` (${t.open} open)` : ""}</button>)}
          </div>
          {d.terms[tab] && (
            <div className="card" style={{ overflowX: "auto" }}>
              {d.terms[tab].rows.length === 0 ? <p className="small-note">Nothing forecast for this term.</p> : (
                <table style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Batch</th><th>Course</th><th style={{ textAlign: "center" }}>Students</th><th style={{ textAlign: "center" }}>Sections</th><th>Suggested teacher(s)</th></tr></thead>
                  <tbody>{d.terms[tab].rows.map((r, i) => (
                    <tr key={i} style={{ background: r.open ? "rgba(214,69,69,.08)" : undefined }}>
                      <td className="small-note">{r.batch}{r.projected ? " *" : ""}</td>
                      <td>{r.code} {r.title}</td>
                      <td style={{ textAlign: "center" }}>{r.students}</td>
                      <td style={{ textAlign: "center" }}>{r.sections}</td>
                      <td>{r.teachers.map((t) => `${t.name}${t.n > 1 ? ` ×${t.n}` : ""}`).join(", ")}{r.open ? <b style={{ color: "#c93c3c" }}>{r.teachers.length ? " + " : ""}{r.open} open</b> : null}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <p className="small-note" style={{ marginTop: 8 }}>* forecast (expected intake or repeaters). Loads: {d.terms[tab].loads.filter((l) => l.n > 0).map((l) => `${l.name} ${l.n}/${l.cap}`).join(" · ") || "—"}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
