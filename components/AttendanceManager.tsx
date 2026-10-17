"use client";

import { useState, useEffect } from "react";

type LectureRow = { id: string; week: number; lectureNumber: number; topic: string; actualDate: string | null };
type RosterStudent = { id: string; name: string; rollNumber: string; status: string | null };
type SummaryRow = { studentId: string; name: string; rollNumber: string; present: number; late: number; absent: number; leave: number; percentage: number | null; flagged: boolean; standing?: string; canMiss?: number | null };
const MARKS = [["PRESENT", "Present"], ["LATE", "Late"], ["ABSENT", "Absent"], ["LEAVE", "Excused"]] as const;

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function AttendanceManager({ courseId, lectureRows: initialRows }: { courseId: string; lectureRows: LectureRow[] }) {
  // Attendance is what dates the course log: whichever lecture it is taken for gets the attendance date.
  const [lectureRows, setLectureRows] = useState<LectureRow[]>(initialRows);
  const firstOpen = initialRows.find((r) => !r.actualDate) || initialRows[initialRows.length - 1];
  const [selectedLectureId, setSelectedLectureId] = useState(firstOpen?.id || "");
  const [date, setDate] = useState(firstOpen?.actualDate || today());
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
        body: JSON.stringify({ date, entries: roster.filter((s) => s.status).map((s) => ({ studentId: s.id, status: s.status })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      setLectureRows((prev) => prev.map((r) => (r.id === selectedLectureId ? { ...r, actualDate: data.actualDate || date } : r)));
      setSaved(true); setSaving(false); loadSummary();
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Mark Attendance for a Lecture</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 0, marginBottom: 10 }}>
          The date you take attendance on becomes that lecture&apos;s date in the Lecture Log and the Course Log File.
        </p>
        {lectureRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No lectures in your plan yet — add them on the Lecture Log tab first.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12 }}>Lecture{" "}
                <select value={selectedLectureId} onChange={(e) => { const r = lectureRows.find((x) => x.id === e.target.value); setSelectedLectureId(e.target.value); setDate(r?.actualDate || today()); loadRoster(e.target.value); }} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 300 }}>
                  {lectureRows.map((r) => <option key={r.id} value={r.id}>Week {r.week}, Lec {r.lectureNumber} — {r.topic} ({r.actualDate || "not held yet"})</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Date{" "}
                <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ padding: "5px 8px" }} />
              </label>
              <button onClick={() => markAll("PRESENT")} className="btn btn-secondary btn-sm">Mark All Present</button>
            </div>

            {loadingRoster ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
            ) : roster.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No students enrolled.</p>
            ) : (
              <>
                <p className="small-note" style={{ marginTop: 0 }}>Tip: press “Mark All Present”, then tap a student's name to switch them to Absent (tap again for Present). {roster.filter((x) => x.status === "ABSENT").length} absent, {roster.filter((x) => x.status === "PRESENT").length} present.</p>
                <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Roll #</th><th>Name</th>{MARKS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
                  <tbody>
                    {roster.map((s) => (
                      <tr key={s.id}>
                        <td>{s.rollNumber}</td>
                        <td onClick={() => setStatus(s.id, s.status === "ABSENT" ? "PRESENT" : "ABSENT")} style={{ cursor: "pointer", fontWeight: 600, color: s.status === "ABSENT" ? "var(--rust)" : undefined, userSelect: "none" }} title="Tap to switch Present / Absent">{s.name}</td>
                        {MARKS.map(([st]) => (
                          <td key={st} style={{ textAlign: "center" }}>
                            <input type="radio" name={`att-${s.id}`} checked={s.status === st} onChange={() => setStatus(s.id, st)} style={{ width: 20, height: 20 }} aria-label={`${s.name}: ${MARKS.find((m) => m[0] === st)![1]}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div style={{ marginTop: 12 }}>
                  {saved && <span style={{ color: "var(--sage)", fontSize: 12, marginRight: 10 }}>Saved.</span>}
                  <button onClick={save} disabled={saving || !date} className="btn btn-brass">{saving ? "Saving…" : "Save Attendance"}</button>
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
            <thead><tr><th>Roll #</th><th>Name</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>%</th><th></th></tr></thead>
            <tbody>
              {(!summary || summary.summary.length === 0) && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No attendance marked yet.</td></tr>}
              {summary?.summary.map((s) => (
                <tr key={s.studentId} style={s.flagged ? { background: "#FBE2DF" } : undefined}>
                  <td>{s.rollNumber}</td><td>{s.name}</td><td>{s.present}</td><td>{s.late ?? 0}</td><td>{s.absent}</td><td>{s.leave}</td>
                  <td style={{ fontWeight: 700, color: s.flagged ? "var(--rust)" : "var(--sage)" }}>{s.percentage !== null ? `${s.percentage}%` : "—"}</td>
                  <td>{s.standing === "CANNOT_RECOVER" ? <span className="badge badge-no">Can no longer reach the minimum</span> : s.flagged ? <span className="badge badge-no">Below Threshold</span> : s.standing === "AT_RISK" ? <span className="badge badge-neutral">Close to the minimum</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
