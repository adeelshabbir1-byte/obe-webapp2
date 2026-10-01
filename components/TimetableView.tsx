"use client";
import { useMemo, useState } from "react";

export type TimetableRow = {
  id: string; dayOfWeek: string; startHour: number; endHour: number;
  courseCode: string; courseTitle: string; sectionLabel: string;
  instructorId: string; instructorName: string;
  roomId: string; roomName: string; roomType: string;
  batchIds: string[]; batchLabels: string[]; degreePrograms: string[];
  timeLabel: string;
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Read-only — used by every role's timetable view. `showFilters` turns on
// the Room/Batch/Instructor/Program dropdowns (Coordinator/Chairman/OMC's
// institution-wide view); Student and Instructor views pass it off since
// their data is already scoped to just their own batch/teaching load.
export default function TimetableView({ entries, showFilters = false }: { entries: TimetableRow[]; showFilters?: boolean }) {
  const [roomId, setRoomId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [degreeProgram, setDegreeProgram] = useState("");

  const rooms = useMemo(() => Array.from(new Map(entries.map((e) => [e.roomId, e.roomName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [entries]);
  const instructors = useMemo(() => Array.from(new Map(entries.map((e) => [e.instructorId, e.instructorName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [entries]);
  const batches = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) e.batchIds.forEach((id, i) => m.set(id, e.batchLabels[i]));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);
  const programs = useMemo(() => Array.from(new Set(entries.flatMap((e) => e.degreePrograms))).sort(), [entries]);

  const filtered = useMemo(() => entries.filter((e) =>
    (!roomId || e.roomId === roomId) &&
    (!batchId || e.batchIds.includes(batchId)) &&
    (!instructorId || e.instructorId === instructorId) &&
    (!degreeProgram || e.degreePrograms.includes(degreeProgram))
  ), [entries, roomId, batchId, instructorId, degreeProgram]);

  const byDay = new Map<string, TimetableRow[]>();
  for (const e of filtered) byDay.set(e.dayOfWeek, [...(byDay.get(e.dayOfWeek) || []), e]);
  const days = DAY_ORDER.filter((d) => byDay.has(d));

  return (
    <>
      {showFilters && (
        <div className="card no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)" }}>
            <option value="">All Rooms</option>
            {rooms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)" }}>
            <option value="">All Batches</option>
            {batches.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)" }}>
            <option value="">All Instructors</option>
            {instructors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={degreeProgram} onChange={(e) => setDegreeProgram(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)" }}>
            <option value="">All Programs / Departments</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {(roomId || batchId || instructorId || degreeProgram) && (
            <button onClick={() => { setRoomId(""); setBatchId(""); setInstructorId(""); setDegreeProgram(""); }} className="btn" style={{ fontSize: 11.5, padding: "4px 10px" }}>Clear filters</button>
          )}
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filtered.length} session{filtered.length === 1 ? "" : "s"}</span>
        </div>
      )}

      {days.length === 0 && (
        <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No timetable sessions match{showFilters ? " this filter" : " — nothing has been generated yet"}.</p></div>
      )}

      {days.map((day) => (
        <div key={day} className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{day}</h3>
          <table>
            <thead><tr><th>Time</th><th>Course</th><th>Section</th><th>Instructor</th><th>Room</th><th>Batch</th></tr></thead>
            <tbody>
              {(byDay.get(day) || []).map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.timeLabel}</td>
                  <td>{e.courseCode} — {e.courseTitle}</td>
                  <td>{e.sectionLabel}</td>
                  <td>{e.instructorName}</td>
                  <td>{e.roomName} <span style={{ color: "var(--slate)", fontSize: 11 }}>({e.roomType === "LAB" ? "Lab" : "Lecture"})</span></td>
                  <td style={{ fontSize: 11.5 }}>{e.batchLabels.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
