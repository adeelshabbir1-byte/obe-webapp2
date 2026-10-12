"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

type StudentRow = {
  id: string; name: string; rollNumber: string; batchId: string; batchLabel: string; currentSemesterNumber: number;
  cgpa: number | null; standing: string; modifiedPlanCount: number; currentCourses: string[];
};
type PendingRequest = { id: string; studentId: string; actionType: string; reasonCode: string; createdAt: string; studentName: string; studentRollNumber: string; courseCode: string; courseTitle: string };
type Data = { advisedBatches: { id: string; label: string }[]; students: StudentRow[]; pendingRequests: PendingRequest[] };

const STANDING: Record<string, { label: string; tone: string; rank: number }> = {
  PROBATION: { label: "Probation", tone: "badge-no", rank: 0 },
  WARNING: { label: "Warning", tone: "badge-warn", rank: 1 },
  GOOD_STANDING: { label: "Good standing", tone: "badge-ok", rank: 2 },
};
const atRisk = (s: StudentRow) => s.standing === "PROBATION" || s.standing === "WARNING";

/** The advisor's workspace, in three clean parts: what needs a decision now, the advisee list (search / filter), and
 * one page per student for the degree plan (/advisor/students/[id]). */
export default function AdvisorDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"attention" | "advisees">("attention");
  const [q, setQ] = useState("");
  const [batch, setBatch] = useState("");
  const [standing, setStanding] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/advisor/students");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); return; }
      setData(json);
      if (!json.pendingRequests.length && !json.students.some(atRisk)) setTab("advisees");
    } catch (err: unknown) { setError("Could not load: " + (err instanceof Error ? err.message : String(err))); }
  }
  useEffect(() => { load(); }, []);

  async function decide(r: PendingRequest, approve: boolean) {
    let note = "";
    if (!approve) { const n = window.prompt(`Reject ${r.studentName}'s request for ${r.courseCode}? Note for the student (optional):`); if (n === null) return; note = n; }
    setBusyId(r.id); setError("");
    const res = await fetch(`/api/advisor/approval-requests/${r.id}/${approve ? "approve" : "reject"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: approve ? undefined : JSON.stringify({ note }) });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { setError(json.error || "Something went wrong."); return; }
    await load();
  }

  const list = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.students
      .filter((s) => (!batch || s.batchId === batch) && (!standing || (standing === "MODIFIED" ? s.modifiedPlanCount > 0 : s.standing === standing)) && (!t || s.name.toLowerCase().includes(t) || s.rollNumber.toLowerCase().includes(t)))
      .sort((a, b) => STANDING[a.standing].rank - STANDING[b.standing].rank || a.name.localeCompare(b.name));
  }, [data, q, batch, standing]);

  if (error && !data) return <div className="err">{error}</div>;
  if (!data) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading your advisees…</p>;

  const risky = data.students.filter(atRisk).sort((a, b) => STANDING[a.standing].rank - STANDING[b.standing].rank || (a.cgpa ?? 0) - (b.cgpa ?? 0));
  const modified = data.students.filter((s) => s.modifiedPlanCount > 0).length;
  const multiBatch = data.advisedBatches.length > 1;

  return (
    <div>
      {error && <div className="err">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Advisees", v: data.students.length, c: "var(--text)", go: () => { setTab("advisees"); setStanding(""); } },
          { l: "Requests waiting", v: data.pendingRequests.length, c: data.pendingRequests.length ? "#B42318" : "#1F5E36", go: () => setTab("attention") },
          { l: "On warning / probation", v: risky.length, c: risky.length ? "#95650F" : "#1F5E36", go: () => setTab("attention") },
          { l: "Off the standard plan", v: modified, c: "var(--text)", go: () => { setTab("advisees"); setStanding("MODIFIED"); } },
        ].map((s) => (
          <button key={s.l} onClick={s.go} className="card" style={{ margin: 0, padding: "10px 14px", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)", background: "var(--card, #fff)" }}>
            <div style={{ fontSize: 12, color: "var(--slate)" }}>{s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.c }}>{s.v}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 14 }}>
        {([["attention", `Needs attention (${data.pendingRequests.length + risky.length})`], ["advisees", `All advisees (${data.students.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13.5, fontWeight: tab === k ? 700 : 400, borderBottom: tab === k ? "2px solid var(--brass)" : "2px solid transparent", color: tab === k ? "var(--brass-dark)" : "var(--slate)" }}>{label}</button>
        ))}
      </div>

      {tab === "attention" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>Registration requests waiting for you ({data.pendingRequests.length})</h3>
            {data.pendingRequests.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>Nothing waiting. ✓</p> : (
              <table style={{ fontSize: 13 }}>
                <thead><tr><th>Student</th><th>Request</th><th>Why it needs you</th><th>Asked</th><th></th></tr></thead>
                <tbody>{data.pendingRequests.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/advisor/students/${r.studentId}`}><b>{r.studentName}</b></Link><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{r.studentRollNumber}</div></td>
                    <td><span className={`badge ${r.actionType === "REGISTER" ? "badge-ok" : "badge-warn"}`}>{r.actionType === "REGISTER" ? "Register" : "Withdraw"}</span> {r.courseCode} — {r.courseTitle}</td>
                    <td style={{ fontSize: 12, color: "var(--slate)" }}>{r.reasonCode === "ACADEMIC_STANDING" ? "Student is on warning / probation" : "Off the standard plan"}</td>
                    <td style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button onClick={() => decide(r, true)} disabled={busyId === r.id} className="btn btn-brass" style={{ fontSize: 12, padding: "4px 12px" }}>Approve</button>{" "}
                      <button onClick={() => decide(r, false)} disabled={busyId === r.id} className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }}>Reject</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>Students on warning or probation ({risky.length})</h3>
            {risky.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>Every advisee is in good standing. ✓</p> : <StudentTable rows={risky} showBatch={multiBatch} />}
          </div>
        </>
      )}

      {tab === "advisees" && (
        <div className="card">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or roll number…" style={{ flex: "1 1 220px" }} />
            {multiBatch && <select value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">All batches</option>{data.advisedBatches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>}
            <select value={standing} onChange={(e) => setStanding(e.target.value)}>
              <option value="">Any standing</option><option value="PROBATION">Probation</option><option value="WARNING">Warning</option><option value="GOOD_STANDING">Good standing</option><option value="MODIFIED">Off the standard plan</option>
            </select>
          </div>
          {list.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>No student matches.</p> : <StudentTable rows={list} showBatch={multiBatch} />}
        </div>
      )}
    </div>
  );
}

function StudentTable({ rows, showBatch }: { rows: StudentRow[]; showBatch: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>Student</th>{showBatch && <th>Batch</th>}<th style={{ textAlign: "center" }}>Semester</th><th style={{ textAlign: "center" }}>CGPA</th><th>Standing</th><th>Plan</th><th>This semester</th><th></th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}>
            <td><b>{s.name}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{s.rollNumber}</div></td>
            {showBatch && <td style={{ fontSize: 12 }}>{s.batchLabel}</td>}
            <td style={{ textAlign: "center" }}>{s.currentSemesterNumber}</td>
            <td style={{ textAlign: "center", fontWeight: 600 }}>{s.cgpa !== null ? s.cgpa.toFixed(2) : "—"}</td>
            <td><span className={`badge ${STANDING[s.standing]?.tone || "badge-neutral"}`}>{STANDING[s.standing]?.label || s.standing}</span></td>
            <td style={{ fontSize: 12 }}>{s.modifiedPlanCount > 0 ? <span className="badge badge-warn">{s.modifiedPlanCount} course{s.modifiedPlanCount > 1 ? "s" : ""} moved</span> : <span style={{ color: "var(--slate)" }}>standard</span>}</td>
            <td style={{ fontSize: 12, color: "var(--slate)" }}>{s.currentCourses.length ? `${s.currentCourses.length} course${s.currentCourses.length > 1 ? "s" : ""}` : "not enrolled"}</td>
            <td><Link href={`/advisor/students/${s.id}`} className="act act-primary">Open</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
