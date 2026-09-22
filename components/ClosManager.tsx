"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";

type Plo = { id: string; number: number; title: string; status: string };
type Clo = { id: string; code: string; statement: string; bloomLevel: string; mappedPloId: string | null; ploContributionPct: number | null; targetPct: number };

const BLOOM_OPTIONS = [
  { v: "C1", label: "C1 — Remember" }, { v: "C2", label: "C2 — Understand" }, { v: "C3", label: "C3 — Apply" },
  { v: "C4", label: "C4 — Analyze" }, { v: "C5", label: "C5 — Evaluate" }, { v: "C6", label: "C6 — Create" },
];

function ploLabel(plos: Plo[], id: string | null) {
  if (!id) return "—";
  const p = plos.find((x) => x.id === id);
  if (!p) return "—";
  return `PLO-${p.number}: ${p.title}${p.status !== "approved" ? " (pending approval)" : ""}`;
}

// Groups CLOs by their mapped PLO and flags any PLO whose CLO contributions
// don't sum to exactly 100% — surfaced live, not just at submit time.
function contributionWarnings(clos: Clo[], plos: Plo[]) {
  const byPlo: Record<string, number> = {};
  for (const c of clos) {
    if (c.mappedPloId) byPlo[c.mappedPloId] = (byPlo[c.mappedPloId] || 0) + (c.ploContributionPct || 0);
  }
  return Object.entries(byPlo)
    .filter(([, total]) => total !== 100)
    .map(([ploId, total]) => {
      const p = plos.find((x) => x.id === ploId);
      return { label: p ? `PLO-${p.number}: ${p.title}` : "Unknown PLO", total };
    });
}

// Every action here updates local state directly from its own request,
// instead of router.refresh() re-fetching this whole course's data
// (CLOs, PLOs, everything) on every single small edit.
export default function ClosManager({ courseId, initialClos, plos }: { courseId: string; initialClos: Clo[]; plos: Plo[] }) {
  const [clos, setClos] = useState<Clo[]>(initialClos);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function addClo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: fd.get("statement"), bloomLevel: fd.get("bloomLevel"),
          mappedPloId: fd.get("mappedPloId") || null, ploContributionPct: fd.get("ploContributionPct") || null,
          targetPct: fd.get("targetPct") || 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setClos((prev) => [...prev, data.clo]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, cloId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      statement: fd.get("statement") as string, bloomLevel: fd.get("bloomLevel") as string,
      mappedPloId: (fd.get("mappedPloId") as string) || null,
      ploContributionPct: fd.get("ploContributionPct") ? Number(fd.get("ploContributionPct")) : null,
      targetPct: Number(fd.get("targetPct") || 60),
    };
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo/${cloId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setClos((prev) => prev.map((c) => c.id === cloId ? { ...c, ...payload } : c));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeClo(cloId: string) {
    setLoading(true);
    await fetch(`/api/subjectexpert/courses/${courseId}/clo/${cloId}`, { method: "DELETE" });
    setClos((prev) => prev.filter((c) => c.id !== cloId));
    setLoading(false);
  }

  async function moveClo(cloId: string, direction: "up" | "down") {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo/${cloId}/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      // Mirror the server's swap-then-renumber logic locally (codes are
      // always "CLO-1", "CLO-2"... by position).
      setClos((prev) => {
        const idx = prev.findIndex((c) => c.id === cloId);
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
        return next.map((c, i) => ({ ...c, code: `CLO-${i + 1}` }));
      });
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  const ploSelectOptions = (
    <>
      <option value="">— No PLO mapped —</option>
      {plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number}: {p.title}{p.status !== "approved" ? " (pending)" : ""}</option>)}
    </>
  );

  const warnings = contributionWarnings(clos, plos);

  return (
    <>
      {error && <div className="err">{error}</div>}
      {plos.length === 0 && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
            The OMC hasn't assigned any PLOs to this course yet (via the PLO–Course Matrix) — CLOs can
            still be added, but won't have a PLO to map to until that happens.
          </p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <p style={{ fontSize: 12.5, color: "var(--rust)", fontWeight: 600, marginBottom: 6 }}>Contribution percentages don't add up to 100%:</p>
          {warnings.map((w) => (
            <p key={w.label} style={{ fontSize: 12, color: "var(--slate)" }}>{w.label} — currently totals {w.total}%</p>
          ))}
        </div>
      )}
      <div className="card">
        <SortableTable>
          <thead><tr><th>Code</th><th>Outcome</th><th>Bloom</th><th>Mapped PLO</th><th>Contribution</th><th>Target %</th><th></th></tr></thead>
          <tbody>
            {clos.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No CLOs yet.</td></tr>
            )}
            {clos.map((c, i) => (
              editingId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={7}>
                    <form onSubmit={(e) => saveEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                      <span style={{ fontWeight: 600 }}>{c.code}</span>
                      <input name="statement" defaultValue={c.statement} style={{ flex: "1 1 220px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                      <select name="bloomLevel" defaultValue={c.bloomLevel} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                        {BLOOM_OPTIONS.map((b) => <option key={b.v} value={b.v}>{b.v}</option>)}
                      </select>
                      <select name="mappedPloId" defaultValue={c.mappedPloId ?? ""} style={{ padding: "6px 8px", border: "1px solid var(--line)", maxWidth: 200 }}>
                        {ploSelectOptions}
                      </select>
                      <input name="ploContributionPct" type="number" min={1} max={100} defaultValue={c.ploContributionPct ?? 100} placeholder="%" style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} />
                      <input name="targetPct" type="number" min={1} max={100} defaultValue={c.targetPct} title="Target % — expected % of students attaining this CO" style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} />
                      <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>
                    {c.code}
                    <div style={{ display: "inline-flex", gap: 2, marginLeft: 6 }}>
                      <button onClick={() => moveClo(c.id, "up")} disabled={loading || i === 0} title="Move up" style={{ background: "none", border: "1px solid var(--line)", cursor: i === 0 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => moveClo(c.id, "down")} disabled={loading || i === clos.length - 1} title="Move down" style={{ background: "none", border: "1px solid var(--line)", cursor: i === clos.length - 1 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === clos.length - 1 ? 0.3 : 1 }}>▼</button>
                    </div>
                  </td>
                  <td>{c.statement}</td><td>{c.bloomLevel}</td><td>{ploLabel(plos, c.mappedPloId)}</td>
                  <td>{c.mappedPloId ? `${c.ploContributionPct ?? 100}%` : "—"}</td>
                  <td>{c.targetPct}%</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setEditingId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={() => removeClo(c.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add CLO</h3>
        <form onSubmit={addClo}>
          <div className="field">
            <label>Bloom's Level</label>
            <select name="bloomLevel" required>{BLOOM_OPTIONS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}</select>
          </div>
          <div className="field"><label>Outcome Statement</label><input name="statement" placeholder="Apply formal logic proofs to..." required /></div>
          <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Mapped PLO (defined by your Program Coordinator)</label>
              <select name="mappedPloId">{ploSelectOptions}</select>
            </div>
            <div className="field">
              <label>Contribution %</label>
              <input name="ploContributionPct" type="number" min={1} max={100} defaultValue={100} placeholder="100" />
            </div>
            <div className="field">
              <label title="Expected % of students who should attain this CO">Target % (attainment)</label>
              <input name="targetPct" type="number" min={1} max={100} defaultValue={60} placeholder="60" />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--slate)", marginTop: -8, marginBottom: 12 }}>
            If more than one CLO in this course maps to the same PLO, their contribution percentages must add up to 100%.
          </p>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add CLO"}</button>
        </form>
      </div>
    </>
  );
}
