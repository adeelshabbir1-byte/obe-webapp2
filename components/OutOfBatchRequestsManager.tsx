"use client";

import { useState } from "react";

type Request = {
  id: string; status: string; reason: string | null; reviewNote: string | null; createdAt: string;
  studentName: string; studentRollNumber: string; studentBatchLabel: string;
  courseCode: string; courseTitle: string; courseBatchLabel: string;
};

export default function OutOfBatchRequestsManager({ initialRequests }: { initialRequests: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initialRequests);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/coordinator/out-of-batch-requests/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "APPROVED" } : r));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function reject(id: string) {
    const note = prompt("Optional note for the student:") || "";
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/coordinator/out-of-batch-requests/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "REJECTED", reviewNote: note } : r));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending ({pending.length})</h3>
        {pending.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No pending requests.</p>}
        {pending.map((r) => (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <b style={{ fontSize: 13 }}>{r.studentName}</b> <span style={{ fontSize: 11.5, color: "var(--slate)" }}>({r.studentRollNumber}, {r.studentBatchLabel})</span>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>wants {r.courseCode} — {r.courseTitle} <span style={{ color: "var(--slate)" }}>({r.courseBatchLabel})</span></div>
                {r.reason && <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 4, fontStyle: "italic" }}>"{r.reason}"</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => approve(r.id)} disabled={busyId === r.id} className="btn btn-approve" style={{ fontSize: 11.5, padding: "4px 10px" }}>Approve</button>
                <button onClick={() => reject(r.id)} disabled={busyId === r.id} className="btn btn-danger" style={{ fontSize: 11.5, padding: "4px 10px", color: "var(--rust)" }}>Reject</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {reviewed.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Reviewed</h3>
          {reviewed.map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <b>{r.studentName}</b> — {r.courseCode} ({r.courseBatchLabel}) —{" "}
              <span className={r.status === "APPROVED" ? "badge badge-ok" : "badge badge-no"}>{r.status}</span>
              {r.reviewNote && <div style={{ fontSize: 11, color: "var(--slate)" }}>{r.reviewNote}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
