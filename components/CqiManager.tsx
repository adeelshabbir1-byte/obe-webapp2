"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Cqi = { id: string; finding: string; actionTaken: string | null; status: string; createdAt: string; batchLabel: string | null; courseLabel: string | null };
type Batch = { id: string; label: string };
type Course = { id: string; label: string };

export default function CqiManager({ initialRecords, batches, courses }: { initialRecords: Cqi[]; batches: Batch[]; courses: Course[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
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
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  const statusBadge: Record<string, string> = { open: "badge-no", "in-progress": "badge-warn", closed: "badge-ok" };

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        {initialRecords.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No CQI records yet.</p>}
        {initialRecords.map((r) => (
          <div key={r.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>{r.batchLabel || ""} {r.courseLabel ? `· ${r.courseLabel}` : ""} · {r.createdAt.slice(0, 10)}</div>
                <div style={{ fontSize: 13, marginTop: 3 }}>{r.finding}</div>
              </div>
              <span className={`badge ${statusBadge[r.status] || "badge-neutral"}`}>{r.status}</span>
            </div>
            {editingId === r.id ? (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); updateRecord(r.id, fd.get("actionTaken") as string, fd.get("status") as string); }} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}><textarea name="actionTaken" defaultValue={r.actionTaken || ""} placeholder="Action taken..." rows={2} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }} /></div>
                <select name="status" defaultValue={r.status} style={{ padding: 6, border: "1px solid var(--line)", fontSize: 12.5 }}>
                  <option value="open">Open</option><option value="in-progress">In Progress</option><option value="closed">Closed</option>
                </select>
                <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
              </form>
            ) : (
              <>
                {r.actionTaken && <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 6 }}><b>Action:</b> {r.actionTaken}</div>}
                <button onClick={() => setEditingId(r.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 6 }}>Update</button>
              </>
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
