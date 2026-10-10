"use client";

import { useEffect, useState } from "react";
import SortableTable from "./SortableTable";

type Plo = { id: string; number: number; title: string; status: string };
type Clo = { id: string; code: string; statement: string; bloomLevel: string; mappedPloId: string | null; ploMappingSource: string | null; ploContributionPct: number | null; targetPct: number };

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

// Splits 100% equally among n CLOs as whole numbers that add up to exactly 100 (e.g. 3 -> 34, 33, 33).
function equalShares(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n), extra = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Every action here updates local state directly from its own request,
// instead of router.refresh() re-fetching this whole course's data
// (CLOs, PLOs, everything) on every single small edit.
export default function ClosManager({ courseId, initialClos, plos, readOnly = false }: { courseId: string; initialClos: Clo[]; plos: Plo[]; readOnly?: boolean }) {
  const [clos, setClos] = useState<Clo[]>(initialClos);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Every row is editable in place; changes are kept here until "Save changes".
  type Draft = { statement: string; bloomLevel: string; mappedPloId: string | null; ploContributionPct: number | null; targetPct: number };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState("");
  const baseOf = (c: Clo): Draft => ({ statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct, targetPct: c.targetPct });
  const rowOf = (c: Clo): Draft => drafts[c.id] || baseOf(c);
  const isDirty = (c: Clo) => {
    const d = drafts[c.id];
    return !!d && (d.statement !== c.statement || d.bloomLevel !== c.bloomLevel || (d.mappedPloId || null) !== (c.mappedPloId || null)
      || (d.mappedPloId ? (d.ploContributionPct ?? 100) !== (c.ploContributionPct ?? 100) : false) || d.targetPct !== c.targetPct);
  };
  const dirtyClos = clos.filter(isDirty);

  function edit(c: Clo, patch: Partial<Draft>) {
    setSaved("");
    setDrafts((prev) => {
      const next: Record<string, Draft> = { ...prev, [c.id]: { ...(prev[c.id] || baseOf(c)), ...patch } };
      // When a CLO moves onto (or off) a PLO, every CLO on the PLOs involved shares that PLO equally.
      if ("mappedPloId" in patch) {
        const before = (prev[c.id] || baseOf(c)).mappedPloId;
        for (const ploId of [before, patch.mappedPloId]) {
          if (!ploId) continue;
          const on = clos.filter((x) => (next[x.id] || baseOf(x)).mappedPloId === ploId);
          const shares = equalShares(on.length);
          on.forEach((x, i) => { next[x.id] = { ...(next[x.id] || baseOf(x)), ploContributionPct: shares[i] }; });
        }
      }
      return next;
    });
  }
  useEffect(() => {
    if (dirtyClos.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyClos.length]);

  async function patchClo(c: Clo, d: Draft): Promise<string | null> {
    const payload = { ...d, statement: d.statement.trim(), ploContributionPct: d.mappedPloId ? (d.ploContributionPct ?? 100) : null, targetPct: d.targetPct || 60 };
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return `${c.code}: ${data.error || "Something went wrong."}`;
      setClos((prev) => prev.map((x) => x.id === c.id ? { ...x, ...payload, ploMappingSource: payload.mappedPloId ? "MANUAL" : null } : x));
      setDrafts((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      return null;
    } catch (err: any) { return `${c.code}: ${err.message}`; }
  }

  async function saveAll() {
    setLoading(true); setError(""); setSaved("");
    let ok = 0;
    for (const c of dirtyClos) {
      const d = rowOf(c);
      if (!d.statement.trim()) { setError(`${c.code}: the outcome statement can't be empty.`); break; }
      const err = await patchClo(c, d);
      if (err) { setError(err); break; }
      ok++;
    }
    if (ok) setSaved(`${ok} CLO${ok === 1 ? "" : "s"} saved.`);
    setLoading(false);
  }

  async function addClo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    // A PLO that already has CLOs: the new one and those already on it share the PLO equally.
    const ploId = (fd.get("mappedPloId") as string) || "";
    const others = ploId ? clos.filter((x) => rowOf(x).mappedPloId === ploId) : [];
    const shares = equalShares(others.length + 1);
    const newShare = others.length ? shares[others.length] : null;
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: fd.get("statement"), bloomLevel: fd.get("bloomLevel"),
          mappedPloId: fd.get("mappedPloId") || null, ploContributionPct: newShare ?? (fd.get("ploContributionPct") || null),
          targetPct: fd.get("targetPct") || 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setClos((prev) => [...prev, data.clo]);
      for (let i = 0; i < others.length; i++) {
        const err = await patchClo(others[i], { ...rowOf(others[i]), ploContributionPct: shares[i] });
        if (err) { setError(err); break; }
      }
      (e.target as HTMLFormElement).reset(); setLoading(false);
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

  const warnings = contributionWarnings(clos.map((c) => ({ ...c, ...rowOf(c) })), plos);

  return (
    <>
      {error && <div className="err">{error}</div>}
      {!readOnly && plos.length === 0 && (
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
          {warnings.map((w, i) => (
            <p key={`${i}-${w.label}`} style={{ fontSize: 12, color: "var(--slate)" }}>{w.label} — currently totals {w.total}%</p>
          ))}
        </div>
      )}
      <div className="card">
        <SortableTable paginate={false}>
          <thead><tr><th>Code</th><th>Outcome</th><th>Bloom</th><th>Mapped PLO</th><th>Contribution</th><th>Target %</th>{!readOnly && <th></th>}</tr></thead>
          <tbody>
            {clos.length === 0 && (
              <tr><td colSpan={readOnly ? 6 : 7} style={{ color: "var(--slate)" }}>No CLOs yet.</td></tr>
            )}
            {clos.map((c, i) => {
              if (readOnly) return (
                <tr key={c.id}>
                  <td>{c.code}</td><td>{c.statement}</td><td>{c.bloomLevel}</td><td>{ploLabel(plos, c.mappedPloId)}</td>
                  <td>{c.mappedPloId ? `${c.ploContributionPct ?? 100}%` : "—"}</td><td>{c.targetPct}%</td>
                </tr>
              );
              const d = rowOf(c);
              const dirty = isDirty(c);
              const box = { padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, background: dirty ? "#FFFBEA" : "#fff" } as const;
              return (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {c.code}{dirty && <span title="Not saved yet" style={{ color: "#B7791F", marginLeft: 3 }}>●</span>}
                    <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                      <button onClick={() => moveClo(c.id, "up")} disabled={loading || i === 0} title="Move up" style={{ background: "none", border: "1px solid var(--line)", cursor: i === 0 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => moveClo(c.id, "down")} disabled={loading || i === clos.length - 1} title="Move down" style={{ background: "none", border: "1px solid var(--line)", cursor: i === clos.length - 1 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === clos.length - 1 ? 0.3 : 1 }}>▼</button>
                    </div>
                  </td>
                  <td style={{ minWidth: 240 }}>
                    <textarea value={d.statement} onChange={(e) => edit(c, { statement: e.target.value })} rows={2} style={{ ...box, width: "100%", resize: "vertical" }} />
                  </td>
                  <td>
                    <select value={d.bloomLevel} onChange={(e) => edit(c, { bloomLevel: e.target.value })} style={box}>
                      {BLOOM_OPTIONS.map((b) => <option key={b.v} value={b.v}>{b.v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={d.mappedPloId ?? ""} onChange={(e) => edit(c, { mappedPloId: e.target.value || null })} style={{ ...box, maxWidth: 230 }}>
                      {ploSelectOptions}
                    </select>
                    {c.mappedPloId && c.ploMappingSource === "SYSTEM" && !dirty && (
                      <div title="Suggested by keyword matching, not yet reviewed - save the row to confirm it" style={{ marginTop: 3, fontSize: 10, color: "#96650F" }}>⚠️ unverified suggestion</div>
                    )}
                  </td>
                  <td>
                    <input type="number" min={1} max={100} disabled={!d.mappedPloId} value={d.mappedPloId ? d.ploContributionPct ?? 100 : ""} onChange={(e) => edit(c, { ploContributionPct: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...box, width: 64 }} />
                  </td>
                  <td>
                    <input type="number" min={1} max={100} value={d.targetPct} onChange={(e) => edit(c, { targetPct: Number(e.target.value) })} title="Expected % of students attaining this CLO" style={{ ...box, width: 64 }} />
                  </td>
                  <td>
                    <button onClick={() => removeClo(c.id)} disabled={loading} className="act act-danger">Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
        {!readOnly && clos.length > 0 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn-brass" onClick={saveAll} disabled={loading || dirtyClos.length === 0}>
              {loading ? "Saving…" : dirtyClos.length ? `Save changes (${dirtyClos.length} CLO${dirtyClos.length === 1 ? "" : "s"})` : "Save changes"}
            </button>
            {dirtyClos.length > 0 && <button className="btn" type="button" onClick={() => { setDrafts({}); setError(""); }} disabled={loading} style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Undo changes</button>}
            {saved && <span style={{ color: "var(--sage)", fontSize: 13 }}>{saved}</span>}
            {!saved && dirtyClos.length === 0 && <span style={{ color: "var(--slate)", fontSize: 12 }}>Edit any cell above, then save. CLOs on the same PLO share it equally by default; you can change the split before saving.</span>}
          </div>
        )}
      </div>

      {!readOnly && (
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
              If more than one CLO in this course maps to the same PLO, they share it equally (their contributions must add up to 100%).
            </p>
            <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add CLO"}</button>
          </form>
        </div>
      )}
    </>
  );
}
