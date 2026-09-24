"use client";

import { useState, useEffect } from "react";

type StudentRow = {
  id: string; name: string; rollNumber: string; batchLabel: string; currentSemesterNumber: number;
  cgpa: number | null; standing: string; modifiedPlanCount: number; currentCourses: string[];
};
type PendingRequest = { id: string; actionType: string; reasonCode: string; createdAt: string; studentName: string; studentRollNumber: string; courseCode: string; courseTitle: string };

const STANDING_LABEL: Record<string, { label: string; tone: string }> = {
  GOOD_STANDING: { label: "Good Standing", tone: "badge-ok" },
  WARNING: { label: "Warning", tone: "badge-warn" },
  PROBATION: { label: "Probation", tone: "badge-no" },
};

export default function AdvisorDashboard() {
  const [data, setData] = useState<{ advisedBatches: { id: string; label: string }[]; students: StudentRow[]; pendingRequests: PendingRequest[] } | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/advisor/students");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); return; }
      setData(json);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/advisor/approval-requests/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function reject(id: string) {
    const note = prompt("Optional note for the student:") || "";
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/advisor/approval-requests/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  if (!data) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  if (data.advisedBatches.length === 0) {
    return <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>You aren't designated as the Advisor for any batch yet — your Program Coordinator sets this under Degree Programs &amp; Batches.</p></div>;
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending Approvals ({data.pendingRequests.length})</h3>
        {data.pendingRequests.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Nothing waiting on you right now.</p>}
        {data.pendingRequests.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--line)", gap: 10, flexWrap: "wrap" }}>
            <div>
              <b style={{ fontSize: 13 }}>{r.studentName}</b> <span style={{ color: "var(--slate)", fontSize: 11.5 }}>({r.studentRollNumber})</span>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                wants to <b>{r.actionType === "REGISTER" ? "register for" : "withdraw from"}</b> {r.courseCode} — {r.courseTitle}
              </div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                Reason: {r.reasonCode === "ACADEMIC_STANDING" ? "student is on Warning/Probation" : "off-track/modified plan"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => approve(r.id)} disabled={busyId === r.id} className="btn btn-brass" style={{ fontSize: 11.5, padding: "4px 10px" }}>Approve</button>
              <button onClick={() => reject(r.id)} disabled={busyId === r.id} className="btn" style={{ fontSize: 11.5, padding: "4px 10px", color: "var(--rust)" }}>Reject</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Your Advisees ({data.students.length})</h3>
        {data.students.map((s) => (
          <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <b style={{ fontSize: 13 }}>{s.name}</b> <span style={{ color: "var(--slate)", fontSize: 11.5 }}>({s.rollNumber}, {s.batchLabel}, Sem {s.currentSemesterNumber})</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>CGPA: {s.cgpa !== null ? s.cgpa.toFixed(2) : "—"}</span>
                <span className={`badge ${STANDING_LABEL[s.standing].tone}`}>{STANDING_LABEL[s.standing].label}</span>
                {s.modifiedPlanCount > 0 && <span className="badge badge-warn">Modified Plan ({s.modifiedPlanCount})</span>}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 4 }}>
              Currently: {s.currentCourses.length > 0 ? s.currentCourses.join(", ") : "not enrolled in anything this semester"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
