"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string; description: string; status: string; chairmanComment: string | null; sourceMasterPloNumber: number | null };
type HecPlo = { number: number; title: string; description: string };

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    draft: ["#EFECE3", "#5B6B7C"], approved: ["#E4EEE8", "#4B7A63"], "changes-requested": ["#F5EAE5", "#B1512E"],
  };
  const [bg, fg] = map[status] || map.draft;
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default function PlosManager({ initialPlos, hecPlos }: { initialPlos: Plo[]; hecPlos: HecPlo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const nextNumber = initialPlos.length ? Math.max(...initialPlos.map((p) => p.number)) + 1 : 1;

  async function copyFromHec(hp: HecPlo) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/plos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: nextNumber, title: hp.title, description: hp.description, sourceMasterPloNumber: hp.number }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCustom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/plos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: fd.get("number"), title: fd.get("title"), description: fd.get("description") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
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
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removePlo(ploId: string) {
    setLoading(true);
    const res = await fetch(`/api/coordinator/plos/${ploId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not delete."); }
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Your Program's PLOs</h3>
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {initialPlos.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No PLOs defined yet.</td></tr>}
            {initialPlos.map((p) => editingId === p.id ? (
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
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Copy from HEC BS Computer Science 2025</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>Adds it as your next PLO number, pre-filled from the official text — fully editable afterward.</p>
        <table>
          <thead><tr><th>#</th><th>Title</th><th></th></tr></thead>
          <tbody>
            {hecPlos.map((hp) => (
              <tr key={hp.number}>
                <td>{hp.number}</td><td>{hp.title}</td>
                <td><button onClick={() => copyFromHec(hp)} disabled={loading} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Copy as PLO-{nextNumber}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
