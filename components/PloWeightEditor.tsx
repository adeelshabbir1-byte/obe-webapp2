"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string; courseType: string; creditHours: number; semesterNumber: number | null; family: string; weight: number; attainment: number | null };
type Plo = { id: string; number: number; title: string; state: string; courses: Course[]; equal: Record<string, number>; suggested: Record<string, number> };

const FAMILY: Record<string, [string, string]> = { COMPUTING: ["Computing", "#E8EEF8"], GENERAL: ["GE / IDS", "#F3EEE2"], CAPSTONE: ["Capstone / FYP", "#E8F3EC"] };
const STATE: Record<string, [string, string]> = { EQUAL: ["equal split (default)", "badge-neutral"], SUGGESTED: ["suggested weights saved", "badge-ok"], SET: ["set by OMC", "badge-ok"] };

/** One PLO: how much each mapped course counts toward it. Total must be 100%. */
export default function PloWeightEditor({ plo, target }: { plo: Plo; target: number }) {
  const router = useRouter();
  const [w, setW] = useState<Record<string, string>>(Object.fromEntries(plo.courses.map((c) => [c.id, String(c.weight ?? 0)])));
  const [source, setSource] = useState<"MANUAL" | "SUGGESTED" | "EQUAL">("MANUAL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const total = Math.round(plo.courses.reduce((s, c) => s + (Number(w[c.id]) || 0), 0) * 100) / 100;
  const ok = Math.abs(total - 100) <= 0.05;
  const changed = plo.courses.some((c) => Number(w[c.id]) !== c.weight) || (plo.state === "EQUAL" && source !== "EQUAL");
  const apply = (m: Record<string, number>, s: "SUGGESTED" | "EQUAL") => { setW(Object.fromEntries(plo.courses.map((c) => [c.id, String(m[c.id] ?? 0)]))); setSource(s); setMsg(null); };

  let att = 0, aw = 0;
  for (const c of plo.courses) if (c.attainment !== null) { att += (Number(w[c.id]) || 0) * c.attainment; aw += Number(w[c.id]) || 0; }
  const batchAtt = aw > 0 ? Math.round((att / aw) * 10) / 10 : null;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/omc/plo-weights", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ploId: plo.id, source, weights: Object.fromEntries(plo.courses.map((c) => [c.id, Number(w[c.id]) || 0])) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not save." }); return; }
    setMsg({ ok: true, text: "Saved." }); router.refresh();
  }
  async function reset() {
    setBusy(true);
    await fetch(`/api/omc/plo-weights?ploId=${plo.id}`, { method: "DELETE" });
    setBusy(false); router.refresh();
  }

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>PLO-{plo.number}: {plo.title}</h3>
        <span className={`badge ${STATE[plo.state][1]}`}>{STATE[plo.state][0]}</span>
        <span style={{ fontSize: 12, color: "var(--slate)" }}>{plo.number < 6 ? "technical PLO — computing courses weigh more" : "soft-skill PLO — GE / IDS courses weigh more"}</span>
        {batchAtt !== null && <span style={{ marginLeft: "auto", fontSize: 12.5 }}>Batch attainment (weighted): <b style={{ color: batchAtt >= target ? "#1F5E36" : "#B42318" }}>{batchAtt}%</b></span>}
      </div>
      {plo.courses.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>No course is mapped to this PLO on the PLO–Course Matrix yet.</p> : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Course</th><th>Type</th><th style={{ textAlign: "center" }}>Sem</th><th style={{ textAlign: "center" }}>CH</th><th style={{ textAlign: "center" }}>Equal</th><th style={{ textAlign: "center" }}>Suggested</th><th style={{ textAlign: "center" }}>Weight %</th><th style={{ textAlign: "center" }}>Students reaching it</th></tr></thead>
              <tbody>{plo.courses.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.code}</b> {c.title}</td>
                  <td><span style={{ background: FAMILY[c.family][1], padding: "1px 7px", borderRadius: 10, fontSize: 11.5 }}>{FAMILY[c.family][0]}</span></td>
                  <td style={{ textAlign: "center" }}>{c.semesterNumber ?? "—"}</td>
                  <td style={{ textAlign: "center" }}>{c.creditHours}</td>
                  <td style={{ textAlign: "center", color: "var(--slate)" }}>{plo.equal[c.id]}</td>
                  <td style={{ textAlign: "center", color: "var(--slate)" }}>{plo.suggested[c.id]}</td>
                  <td style={{ textAlign: "center" }}><input type="number" min={0} max={100} step={0.01} value={w[c.id]} onChange={(e) => { setW({ ...w, [c.id]: e.target.value }); setSource("MANUAL"); }} style={{ width: 80, textAlign: "right" }} /></td>
                  <td style={{ textAlign: "center" }}>{c.attainment !== null ? `${c.attainment}%` : <span style={{ color: "var(--slate)" }}>no results yet</span>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={6} style={{ textAlign: "right", fontWeight: 600 }}>Total</td><td style={{ textAlign: "center", fontWeight: 700, color: ok ? "#1F5E36" : "#B42318" }}>{total}%</td><td /></tr></tfoot>
            </table>
          </div>
          {msg && <div className={msg.ok ? "" : "err"} style={msg.ok ? { color: "#1F5E36", fontSize: 13, marginTop: 6 } : { marginTop: 6 }}>{msg.text}</div>}
          {!ok && <p style={{ fontSize: 12.5, color: "#B42318", margin: "6px 0 0" }}>The weights must add up to 100% ({Math.round((100 - total) * 100) / 100 > 0 ? `${Math.round((100 - total) * 100) / 100}% still to give` : `${Math.round((total - 100) * 100) / 100}% too much`}).</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => apply(plo.equal, "EQUAL")}>Equal split</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => apply(plo.suggested, "SUGGESTED")}>Use suggestion</button>
            <button className="btn" disabled={busy || !ok || !changed} onClick={save}>{busy ? "Saving…" : "Save weights"}</button>
            {plo.state !== "EQUAL" && <button className="btn btn-secondary" disabled={busy} onClick={reset} style={{ marginLeft: "auto" }}>Back to equal split</button>}
          </div>
        </>
      )}
    </div>
  );
}
