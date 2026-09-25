"use client";

import { useState, useEffect } from "react";

type LectureRow = { id: string; week: number; lectureNumber: number; topic: string; actualDate: string | null };
type RosterStudent = { id: string; name: string; rollNumber: string; status: string | null };
type SummaryRow = { studentId: string; name: string; rollNumber: string; present: number; absent: number; leave: number; percentage: number | null; flagged: boolean };

export default function AttendanceManager({ courseId, lectureRows }: { courseId: string; lectureRows: LectureRow[] }) {
  const deliveredLectures = lectureRows.filter((r) => r.actualDate);
  const [selectedLectureId, setSelectedLectureId] = useState(deliveredLectures[0]?.id || "");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [summary, setSummary] = useState<{ deliveredLectures: number; threshold: number; summary: SummaryRow[] } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  async function loadRoster(lectureId: string) {
    if (!lectureId) return;
    setLoadingRoster(true); setSaved(false); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/attendance/${lectureId}`);
      const data = await res.json();
      setRoster(data.students || []);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
    setLoadingRoster(false);
  }

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/attendance-summary`);
      const data = await res.json();
      setSummary(data);
    } catch { /* ignore */ }
    setLoadingSummary(false);
  }

  useEffect(() => { loadRoster(selectedLectureId); loadSummary(); }, []);

  function setStatus(studentId: string, status: string) {
    setRoster((prev) => prev.map((s) => (s.id === studentId ? { ...s, status } : s)));
  }

  function markAll(status: string) {
    setRoster((prev) => prev.map((s) => ({ ...s, status })));
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/attendance/${selectedLectureId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: roster.filter((s) => s.status).map((s) => ({ studentId: s.id, status: s.status })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      setSaved(true); setSaving(false); loadSummary();
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Mark Attendance for a Lecture</h3>
        {deliveredLectures.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No delivered lectures yet — mark a lecture's actual date on the Lecture Content tab first.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <select value={selectedLectureId} onChange={(e) => { setSelectedLectureId(e.target.value); loadRoster(e.target.value); }} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 300 }}>
                {deliveredLectures.map((r) => <option key={r.id} value={r.id}>Week {r.week}, Lec {r.lectureNumber} — {r.topic} ({r.actualDate})</option>)}
              </select>
              <button onClick={() => markAll("PRESENT")} style={{ background: "none", border: "1px solid var(--line)", padding: "5px 10px", fontSize: 11.5, cursor: "pointer" }}>Mark All Present</button>
            </div>

            {loadingRoster ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
            ) : roster.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No students enrolled.</p>
            ) : (
              <>
                <table>
                  <thead><tr><th>Roll #</th><th>Name</th><th>Present</th><th>Absent</th><th>Leave</th></tr></thead>
                  <tbody>
                    {roster.map((s) => (
                      <tr key={s.id}>
                        <td>{s.rollNumber}</td><td>{s.name}</td>
                        {["PRESENT", "ABSENT", "LEAVE"].map((st) => (
                          <td key={st} style={{ textAlign: "center" }}>
                            <input type="radio" name={`att-${s.id}`} checked={s.status === st} onChange={() => setStatus(s.id, st)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12 }}>
                  {saved && <span style={{ color: "var(--sage)", fontSize: 12, marginRight: 10 }}>Saved.</span>}
                  <button onClick={save} disabled={saving} className="btn btn-brass">{saving ? "Saving…" : "Save Attendance"}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Attendance Summary</h3>
        {summary && <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>{summary.deliveredLectures} lecture(s) delivered so far. Students below {summary.threshold}% are flagged.</p>}
        {loadingSummary ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
        ) : (
          <table>
            <thead><tr><th>Roll #</th><th>Name</th><th>Present</th><th>Absent</th><th>Leave</th><th>%</th><th></th></tr></thead>
            <tbody>
              {(!summary || summary.summary.length === 0) && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No attendance marked yet.</td></tr>}
              {summary?.summary.map((s) => (
                <tr key={s.studentId} style={s.flagged ? { background: "#FFE8ED" } : undefined}>
                  <td>{s.rollNumber}</td><td>{s.name}</td><td>{s.present}</td><td>{s.absent}</td><td>{s.leave}</td>
                  <td style={{ fontWeight: 700, color: s.flagged ? "var(--rust)" : "var(--sage)" }}>{s.percentage !== null ? `${s.percentage}%` : "—"}</td>
                  <td>{s.flagged && <span className="badge badge-no">Below Threshold</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
