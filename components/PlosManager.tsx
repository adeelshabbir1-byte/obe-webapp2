"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { safeFetchJson } from "../lib/safeFetchJson";

type Plo = { id: string; number: number; title: string; description: string; status: string; chairmanComment: string | null; sourceMasterPloNumber: number | null };
type HecPlo = { number: number; title: string; description: string };

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    draft: ["#EFECE3", "#574C50"], approved: ["#E2F4E8", "#1D8A4E"], "changes-requested": ["#FBE2DF", "#C0312B"],
  };
  const [bg, fg] = map[status] || map.draft;
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default function PlosManager({ initialPlos, hecPlos, batchId, otherBatches }: {
  initialPlos: Plo[]; hecPlos: HecPlo[]; batchId: string; otherBatches: { id: string; label: string }[];
}) {
  const [plos, setPlos] = useState<Plo[]>(initialPlos);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copySourceBatchId, setCopySourceBatchId] = useState("");
  const [bulkResult, setBulkResult] = useState("");

  const nextNumber = plos.length ? Math.max(...plos.map((p) => p.number)) + 1 : 1;

  async function addAllHec() {
    setLoading(true); setError(""); setBulkResult("");
    try {
      const res = await fetch("/api/coordinator/plos/bulk-add-hec", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }),
      });
      const { ok, data } = await safeFetchJson(res);
      if (!ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setBulkResult(`Added ${data.created} PLO(s).${data.skipped ? ` (${data.skipped} already existed at those numbers.)` : ""}`);
      if (data.plos) setPlos((prev) => [...prev, ...data.plos].sort((a, b) => a.number - b.number));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function copyAllFromBatch() {
    if (!copySourceBatchId) { setError("Select a batch to copy from first."); return; }
    setLoading(true); setError(""); setBulkResult("");
    try {
      const res = await fetch("/api/coordinator/plos/copy-from-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBatchId: copySourceBatchId, targetBatchId: batchId }),
      });
      const { ok, data } = await safeFetchJson(res);
      if (!ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setBulkResult(`Copied ${data.created} PLO(s).${data.skipped ? ` (${data.skipped} already existed at those numbers.)` : ""}`);
      if (data.plos) setPlos((prev) => [...prev, ...data.plos].sort((a, b) => a.number - b.number));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function copyFromHec(hp: HecPlo) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/plos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: nextNumber, title: hp.title, description: hp.description, sourceMasterPloNumber: hp.number, batchId }),
      });
      const { ok, data } = await safeFetchJson(res);
      if (!ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setPlos((prev) => [...prev, data.plo].sort((a, b) => a.number - b.number));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCustom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/plos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: fd.get("number"), title: fd.get("title"), description: fd.get("description"), batchId }),
      });
      const { ok, data } = await safeFetchJson(res);
      if (!ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setPlos((prev) => [...prev, data.plo].sort((a, b) => a.number - b.number));
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, ploId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coordinator/plos/${ploId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fd.get("title"), description: fd.get("description") }),
      });
      const { ok, data } = await safeFetchJson(res);
      if (!ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setPlos((prev) => prev.map((p) => p.id === ploId ? { ...p, ...data.plo } : p));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removePlo(ploId: string) {
    setLoading(true);
    const res = await fetch(`/api/coordinator/plos/${ploId}`, { method: "DELETE" });
    const { ok, data } = await safeFetchJson(res);
    if (!ok) { setError(data.error || "Could not delete."); setLoading(false); return; }
    setPlos((prev) => prev.filter((p) => p.id !== ploId));
    setLoading(false);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {bulkResult && <div style={{ background: "#E2F4E8", color: "var(--sage)", border: "1px solid #B8E0C4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{bulkResult}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Add All PLOs at Once</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>All added as editable copies — nothing stays locked to the source.</p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <button onClick={addAllHec} disabled={loading} className="btn btn-brass" style={{ padding: "8px 14px" }}>Add All 10 HEC PLOs</button>
          </div>
          {otherBatches.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Copy From Another Batch</label>
                <select value={copySourceBatchId} onChange={(e) => setCopySourceBatchId(e.target.value)} style={{ padding: "7px 9px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                  <option value="">— Select batch —</option>
                  {otherBatches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <button onClick={copyAllFromBatch} disabled={loading || !copySourceBatchId} className="btn btn-brass" style={{ padding: "8px 14px" }}>Copy All PLOs</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Your Program's PLOs</h3>
        <SortableTable>
          <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {plos.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No PLOs defined yet.</td></tr>}
            {plos.map((p) => editingId === p.id ? (
              <tr key={p.id}>
                <td colSpan={5}>
                  <form onSubmit={(e) => saveEdit(e, p.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600 }}>PLO-{p.number}</span>
                    <input name="title" defaultValue={p.title} placeholder="Title" style={{ flex: "1 1 160px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="description" defaultValue={p.description} placeholder="Description" style={{ flex: "2 1 260px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>PLO-{p.number}</td><td>{p.title}</td><td>{p.description}</td>
                <td>{statusBadge(p.status)}{p.chairmanComment ? <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 3 }}>{p.chairmanComment}</div> : null}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingId(p.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                  <button onClick={() => removePlo(p.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Copy from HEC BS Computer Science 2025</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>Adds it as your next PLO number, pre-filled from the official text — fully editable afterward.</p>
        <SortableTable>
          <thead><tr><th>#</th><th>Title</th><th></th></tr></thead>
          <tbody>
            {hecPlos.map((hp) => (
              <tr key={hp.number}>
                <td>{hp.number}</td><td>{hp.title}</td>
                <td><button onClick={() => copyFromHec(hp)} disabled={loading} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Copy as PLO-{nextNumber}</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add Custom PLO</h3>
        <form onSubmit={addCustom}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 14 }}>
            <div className="field"><label>PLO Number</label><input name="number" type="number" defaultValue={nextNumber} required /></div>
            <div className="field"><label>Title</label><input name="title" placeholder="Problem-Solving and Critical Thinking" required /></div>
          </div>
          <div className="field"><label>Description</label><input name="description" placeholder="Students should be able to..." required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add PLO"}</button>
        </form>
      </div>
    </>
  );
}
