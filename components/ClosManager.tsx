"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string; status: string };
type Clo = { id: string; code: string; statement: string; bloomLevel: string; mappedPloId: string | null };

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

export default function ClosManager({ courseId, initialClos, plos }: { courseId: string; initialClos: Clo[]; plos: Plo[] }) {
  const router = useRouter();
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
          code: fd.get("code"), statement: fd.get("statement"), bloomLevel: fd.get("bloomLevel"),
          mappedPloId: fd.get("mappedPloId") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, cloId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/clo/${cloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: fd.get("statement"), bloomLevel: fd.get("bloomLevel"), mappedPloId: fd.get("mappedPloId") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeClo(cloId: string) {
    setLoading(true);
    await fetch(`/api/subjectexpert/courses/${courseId}/clo/${cloId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  const ploSelectOptions = (
    <>
      <option value="">— No PLO mapped —</option>
      {plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number}: {p.title}{p.status !== "approved" ? " (pending)" : ""}</option>)}
    </>
  );

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
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Outcome</th><th>Bloom</th><th>Mapped PLO</th><th></th></tr></thead>
          <tbody>
            {initialClos.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No CLOs yet.</td></tr>
            )}
            {initialClos.map((c) => (
              editingId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={5}>
                    <form onSubmit={(e) => saveEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                      <span style={{ fontWeight: 600 }}>{c.code}</span>
                      <input name="statement" defaultValue={c.statement} style={{ flex: "1 1 260px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                      <select name="bloomLevel" defaultValue={c.bloomLevel} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                        {BLOOM_OPTIONS.map((b) => <option key={b.v} value={b.v}>{b.v}</option>)}
                      </select>
                      <select name="mappedPloId" defaultValue={c.mappedPloId ?? ""} style={{ padding: "6px 8px", border: "1px solid var(--line)", maxWidth: 220 }}>
                        {ploSelectOptions}
                      </select>
                      <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.code}</td><td>{c.statement}</td><td>{c.bloomLevel}</td><td>{ploLabel(plos, c.mappedPloId)}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setEditingId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={() => removeClo(c.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add CLO</h3>
        <form onSubmit={addClo}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field"><label>CLO Code</label><input name="code" placeholder="CLO-1" required /></div>
            <div className="field">
              <label>Bloom's Level</label>
              <select name="bloomLevel" required>{BLOOM_OPTIONS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}</select>
            </div>
          </div>
          <div className="field"><label>Outcome Statement</label><input name="statement" placeholder="Apply formal logic proofs to..." required /></div>
          <div className="field">
            <label>Mapped PLO (defined by your Program Coordinator)</label>
            <select name="mappedPloId">{ploSelectOptions}</select>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add CLO"}</button>
        </form>
      </div>
    </>
  );
}
