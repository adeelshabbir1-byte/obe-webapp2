"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReportDef = { id: string; title: string };
type Bundle = { id: string; name: string; description: string | null; reportIds: string[] };

export default function ReportBundleManager({ apiEndpoint, reports, bundles, extraBundles, extraLabel, readOnlyExtra }: {
  apiEndpoint: string; reports: ReportDef[]; bundles: Bundle[];
  extraBundles?: Bundle[]; extraLabel?: string; readOnlyExtra?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!name.trim() || selected.length === 0) { setError("Give it a name and pick at least one report."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, reportIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setName(""); setDescription(""); setSelected([]); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function remove(id: string, endpoint: string) {
    setLoading(true);
    await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  function BundleList({ list, endpoint, deletable }: { list: Bundle[]; endpoint: string; deletable: boolean }) {
    return (
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Reports</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None yet.</td></tr>}
            {list.map((b) => (
              <tr key={b.id}>
                <td><b>{b.name}</b>{b.description && <div style={{ fontSize: 11, color: "var(--slate)" }}>{b.description}</div>}</td>
                <td style={{ fontSize: 11.5 }}>{b.reportIds.length} report(s)</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <a href={`/reports/print-bundle/${b.id}`} className="btn btn-brass" style={{ padding: "3px 10px", fontSize: 11, textDecoration: "none" }}>Open</a>
                  {deletable && <button onClick={() => remove(b.id, endpoint)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <BundleList list={bundles} endpoint={apiEndpoint} deletable={true} />

      {extraBundles && (
        <>
          <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>{extraLabel}</h3>
          <BundleList list={extraBundles} endpoint={apiEndpoint} deletable={!readOnlyExtra} />
        </>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Create a New Bundle</h3>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NCEAC Visit Package" /></div>
        <div className="field"><label>Description (optional)</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 6 }}>Reports</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12, maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", padding: 10 }}>
          {reports.map((r) => (
            <label key={r.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /> {r.title}
            </label>
          ))}
        </div>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save Bundle"}</button>
      </div>
    </>
  );
}
