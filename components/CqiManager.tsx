"use client";

import { useState, useRef } from "react";

type Cqi = {
  id: string; finding: string; actionTaken: string | null; status: string; createdAt: string;
  batchLabel: string | null; courseLabel: string | null; authorName: string | null; lastUpdatedByName: string | null;
  sourceType: string | null; sourceReference: string | null; metricBefore: number | null; metricAfter: number | null;
};
type Batch = { id: string; label: string };
type Course = { id: string; label: string };

export default function CqiManager({ initialRecords, batches, courses }: { initialRecords: Cqi[]; batches: Batch[]; courses: Course[] }) {
  const [records, setRecords] = useState<Cqi[]>(initialRecords);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const actionTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  async function draftAction(id: string) {
    setDraftingId(id); setError("");
    try {
      const res = await fetch(`/api/chairman/cqi/${id}/draft-action`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setDraftingId(null); return; }
      const el = actionTextareaRefs.current[id];
      if (el) { el.value = data.draft; el.focus(); }
      setDraftingId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setDraftingId(null); }
  }

  async function addRecord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/chairman/cqi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding: fd.get("finding"), batchId: fd.get("batchId") || null, courseId: fd.get("courseId") || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRecords((prev) => [data.record, ...prev]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function updateRecord(id: string, actionTaken: string, status: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/chairman/cqi/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionTaken, status }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRecords((prev) => prev.map((r) => r.id === id ? data.record : r));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function verifyRecord(id: string, metricAfter: string, status: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/chairman/cqi/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metricAfter, status }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRecords((prev) => prev.map((r) => r.id === id ? data.record : r));
      setVerifyingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  const statusBadge: Record<string, string> = {
    open: "badge-no", "in-progress": "badge-warn", closed: "badge-ok",
    "verified-effective": "badge-ok", "verified-ineffective": "badge-no",
  };

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        {records.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No CQI records yet.</p>}
        {records.map((r) => (
          <div key={r.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>
                  {r.sourceReference && <span className="badge badge-neutral" style={{ marginRight: 6 }}>{r.sourceType}: {r.sourceReference}</span>}
                  {r.batchLabel || ""} {r.courseLabel ? `· ${r.courseLabel}` : ""} · {r.createdAt.slice(0, 10)}{r.authorName ? ` · raised by ${r.authorName}` : ""}{r.lastUpdatedByName ? ` · last updated by ${r.lastUpdatedByName}` : ""}
                </div>
                <div style={{ fontSize: 13, marginTop: 3 }}>{r.finding}</div>
                {(r.metricBefore !== null || r.metricAfter !== null) && (
                  <div style={{ fontSize: 11.5, marginTop: 4, color: "var(--slate)" }}>
                    {r.metricBefore !== null && <span>Before: <b style={{ color: "var(--ink)" }}>{r.metricBefore}%</b></span>}
                    {r.metricAfter !== null && (
                      <span style={{ marginLeft: 10 }}>
                        After: <b style={{ color: r.metricAfter >= (r.metricBefore ?? 0) ? "var(--sage)" : "var(--rust)" }}>{r.metricAfter}%</b>
                        {r.metricBefore !== null && (r.metricAfter >= r.metricBefore ? " ↑ improved" : " ↓ did not improve")}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className={`badge ${statusBadge[r.status] || "badge-neutral"}`}>{r.status}</span>
            </div>
            {editingId === r.id ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); updateRecord(r.id, fd.get("actionTaken") as string, fd.get("status") as string); }} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <textarea
                    name="actionTaken" defaultValue={r.actionTaken || ""} placeholder="Action taken..." rows={2}
                    ref={(el) => { actionTextareaRefs.current[r.id] = el; }}
                    style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }}
                  />
                  <button
                    type="button" onClick={() => draftAction(r.id)} disabled={draftingId === r.id}
                    className="act act-primary"
                  >
                    {draftingId === r.id ? "Drafting…" : "✨ AI Draft"}
                  </button>
                </div>
                <select name="status" defaultValue={r.status} style={{ padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }}>
                  <option value="open">Open</option><option value="in-progress">In Progress</option><option value="closed">Closed</option>
                </select>
                <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
              </form>
            ) : verifyingId === r.id ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); verifyRecord(r.id, fd.get("metricAfter") as string, fd.get("verifyStatus") as string); }} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--slate)", display: "block" }}>New metric value (%)</label>
                  <input name="metricAfter" type="number" step="0.1" required style={{ width: 90, padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }} />
                </div>
                <select name="verifyStatus" style={{ padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }}>
                  <option value="verified-effective">Effective — it worked</option>
                  <option value="verified-ineffective">Ineffective — needs more action</option>
                </select>
                <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save Verification</button>
                <button type="button" onClick={() => setVerifyingId(null)} style={{ background: "none", border: "1px solid var(--line)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer" }}>Cancel</button>
              </form>
            ) : (
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
                {r.actionTaken && <div style={{ fontSize: 12, color: "var(--slate)" }}><b>Action:</b> {r.actionTaken}</div>}
                <button onClick={() => setEditingId(r.id)} className="act act-primary">Update</button>
                {r.metricBefore !== null && r.metricAfter === null && (
                  <button onClick={() => setVerifyingId(r.id)} className="act act-danger">Verify Now — Did It Work?</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Log a Finding</h3>
        <form onSubmit={addRecord}>
          <div className="field"><label>Finding</label><textarea name="finding" rows={2} required style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field"><label>Batch (optional)</label><select name="batchId"><option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></div>
            <div className="field"><label>Course (optional)</label><select name="courseId"><option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Log Finding"}</button>
        </form>
      </div>
    </>
  );
}
