"use client";

import { useState, useEffect } from "react";

type Enrollment = { id: string; courseId: string; code: string; title: string; courseType: string };
type Elective = { id: string; code: string; title: string; creditHours: number };
type OtherBatchCourse = { id: string; code: string; title: string; batchLabel: string; semesterNumber: number | null };
type OutOfBatchReq = { id: string; status: string; reviewNote: string | null; courseCode: string; courseTitle: string; batchLabel: string };

export default function StudentRegistrationManager() {
  const [data, setData] = useState<{
    registrationOpen: boolean; currentSemesterNumber: number; myEnrollments: Enrollment[];
    availableElectives: Elective[]; otherBatchCourses: OtherBatchCourse[]; myOutOfBatchRequests: OutOfBatchReq[];
  } | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [otherBatchSearch, setOtherBatchSearch] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/student/registration");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); return; }
      setData(json);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function register(courseId: string) {
    setBusyId(courseId); setError(""); setInfo("");
    try {
      const res = await fetch("/api/student/registration/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      if (json.pendingApproval) setInfo(json.message);
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function withdraw(courseId: string) {
    if (!confirm("Withdraw from this course? Any marks already recorded for it will be removed too.")) return;
    setBusyId(courseId); setError(""); setInfo("");
    try {
      const res = await fetch("/api/student/registration/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      if (json.pendingApproval) setInfo(json.message);
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function requestOutOfBatch(courseId: string) {
    const reason = prompt("Briefly, why do you need this course from a different batch?") || "";
    setBusyId(courseId); setError("");
    try {
      const res = await fetch("/api/student/out-of-batch-requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, reason }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Something went wrong."); setBusyId(null); return; }
      await load(); setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  if (!data) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  const filteredOtherBatch = data.otherBatchCourses.filter((c) => {
    if (!otherBatchSearch.trim()) return false; // only show once they search, given this list can be large
    const q = otherBatchSearch.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
  });

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {info && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{info}</div>}

      {!data.registrationOpen && (
        <div className="card" style={{ background: "#FFF3DC" }}>
          <p style={{ fontSize: 12.5 }}>Registration isn't open right now — you can still see your courses below, but registering, withdrawing, or requesting an out-of-batch course is closed until your Coordinator opens it.</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>My Courses (Semester {data.currentSemesterNumber})</h3>
        {data.myEnrollments.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Not enrolled in anything yet this semester.</p>}
        {data.myEnrollments.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13 }}>{e.code} — {e.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({e.courseType})</span></span>
            {e.courseType === "Elective" && (
              <button onClick={() => withdraw(e.courseId)} disabled={!data.registrationOpen || busyId === e.courseId} style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer", fontSize: 11.5 }}>
                Withdraw
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Available Electives</h3>
        {data.availableElectives.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No electives available to register for right now.</p>}
        {data.availableElectives.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13 }}>{c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.creditHours} cr)</span></span>
            <button onClick={() => register(c.id)} disabled={!data.registrationOpen || busyId === c.id} className="btn btn-brass" style={{ fontSize: 11.5, padding: "4px 10px" }}>
              Register
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Request a Course From Another Batch</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          Needed a course outside your own batch's schedule? Search for it and submit a request — your
          Program Coordinator reviews and approves it before you're enrolled.
        </p>
        <input
          value={otherBatchSearch} onChange={(e) => setOtherBatchSearch(e.target.value)}
          placeholder="Search by course code or title…" style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: "100%", maxWidth: 320, marginBottom: 10 }}
        />
        {otherBatchSearch.trim() && filteredOtherBatch.length === 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>No matches.</p>}
        {filteredOtherBatch.slice(0, 15).map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13 }}>{c.code} — {c.title} <span style={{ color: "var(--slate)", fontSize: 11 }}>({c.batchLabel})</span></span>
            <button onClick={() => requestOutOfBatch(c.id)} disabled={!data.registrationOpen || busyId === c.id} className="btn" style={{ fontSize: 11.5, padding: "4px 10px" }}>
              Request
            </button>
          </div>
        ))}
      </div>

      {data.myOutOfBatchRequests.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>My Out-of-Batch Requests</h3>
          {data.myOutOfBatchRequests.map((r) => (
            <div key={r.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontSize: 13 }}>{r.courseCode} — {r.courseTitle} <span style={{ color: "var(--slate)", fontSize: 11 }}>({r.batchLabel})</span></span>
              <span className={r.status === "APPROVED" ? "badge badge-ok" : r.status === "REJECTED" ? "badge badge-no" : "badge badge-warn"} style={{ marginLeft: 8 }}>{r.status}</span>
              {r.reviewNote && <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 2 }}>{r.reviewNote}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
