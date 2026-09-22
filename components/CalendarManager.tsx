"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";

type Holiday = { id: string; date: string; label: string };
type DayMode = { id: string; date: string; mode: string };
type Course = { id: string; code: string; title: string; midtermStartDate: string | null; midtermEndDate: string | null; finalStartDate: string | null; finalEndDate: string | null };
type SemesterDate = {
  degreeProgram: string; termName: string; termYear: number; semesterStartDate: string | null;
  midtermStartDate: string | null; midtermEndDate: string | null; finalStartDate: string | null; finalEndDate: string | null;
};

// Given a semester start date, suggest Week 9 Monday–Sunday for midterm and
// Week 17 Monday–Sunday for final — a starting point the Coordinator can
// freely override.
function suggestExamWeeks(semesterStartDate: string) {
  if (!semesterStartDate) return null;
  const start = new Date(semesterStartDate + "T00:00:00");
  const day = start.getDay(); // 0=Sun..6=Sat
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const week1Monday = new Date(start); week1Monday.setDate(week1Monday.getDate() + daysToMonday);

  function weekRange(weekNumber: number) {
    const monday = new Date(week1Monday); monday.setDate(monday.getDate() + (weekNumber - 1) * 7);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
  }

  return { midterm: weekRange(9), final: weekRange(17) };
}

export default function CalendarManager({ initialHolidays, initialDayModes, courses: initialCourses, degreePrograms, initialSemesterDates, defaultTermName, defaultTermYear }: {
  initialHolidays: Holiday[]; initialDayModes: DayMode[]; courses: Course[];
  degreePrograms: string[]; initialSemesterDates: SemesterDate[]; defaultTermName: string; defaultTermYear: number;
}) {
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [dayModes, setDayModes] = useState<DayMode[]>(initialDayModes);
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [semesterDates, setSemesterDates] = useState<SemesterDate[]>(initialSemesterDates);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "");
  const [selectedDegree, setSelectedDegree] = useState(degreePrograms[0] || "");

  const currentDegreeDates = semesterDates.find((d) => d.degreeProgram === selectedDegree && d.termName === defaultTermName && d.termYear === defaultTermYear);

  const [semesterStart, setSemesterStart] = useState(currentDegreeDates?.semesterStartDate ? currentDegreeDates.semesterStartDate.slice(0, 10) : "");
  const [midtermStart, setMidtermStart] = useState(currentDegreeDates?.midtermStartDate ? currentDegreeDates.midtermStartDate.slice(0, 10) : "");
  const [midtermEnd, setMidtermEnd] = useState(currentDegreeDates?.midtermEndDate ? currentDegreeDates.midtermEndDate.slice(0, 10) : "");
  const [finalStart, setFinalStart] = useState(currentDegreeDates?.finalStartDate ? currentDegreeDates.finalStartDate.slice(0, 10) : "");
  const [finalEnd, setFinalEnd] = useState(currentDegreeDates?.finalEndDate ? currentDegreeDates.finalEndDate.slice(0, 10) : "");

  function onSemesterStartChange(value: string) {
    setSemesterStart(value);
    const suggestion = suggestExamWeeks(value);
    if (suggestion) {
      setMidtermStart(suggestion.midterm.start); setMidtermEnd(suggestion.midterm.end);
      setFinalStart(suggestion.final.start); setFinalEnd(suggestion.final.end);
    }
  }

  async function saveSemesterDates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/semester-dates", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degreeProgram: selectedDegree, termName: fd.get("termName"), termYear: fd.get("termYear"),
          semesterStartDate: semesterStart || null,
          midtermStartDate: midtermStart || null, midtermEndDate: midtermEnd || null,
          finalStartDate: finalStart || null, finalEndDate: finalEnd || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setSemesterDates((prev) => {
        const idx = prev.findIndex((d) => d.degreeProgram === data.record.degreeProgram && d.termName === data.record.termName && d.termYear === data.record.termYear);
        if (idx === -1) return [...prev, data.record];
        const next = [...prev]; next[idx] = data.record; return next;
      });
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addHoliday(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/holidays", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fd.get("date"), label: fd.get("label") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setHolidays((prev) => [...prev, data.holiday].sort((a, b) => a.date.localeCompare(b.date)));
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeHoliday(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/holidays/${id}`, { method: "DELETE" });
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    setLoading(false);
  }

  async function addDayMode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/class-day-modes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fd.get("date"), mode: fd.get("mode") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setDayModes((prev) => [...prev, data.mode].sort((a, b) => a.date.localeCompare(b.date)));
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeDayMode(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/class-day-modes/${id}`, { method: "DELETE" });
    setDayModes((prev) => prev.filter((m) => m.id !== id));
    setLoading(false);
  }

  async function saveExamDates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coordinator/courses/${selectedCourseId}/exam-dates`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          midtermStartDate: fd.get("midtermStartDate") || null, midtermEndDate: fd.get("midtermEndDate") || null,
          finalStartDate: fd.get("finalStartDate") || null, finalEndDate: fd.get("finalEndDate") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.map((c) => c.id === selectedCourseId ? { ...c, ...data.course } : c));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card" style={{ borderColor: "var(--brass)" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10, color: "var(--brass-dark)" }}>Semester Dates, by Degree Program</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
          Applies to every course currently offered under this degree program. Setting the semester start date
          auto-suggests Midterm week (Week 9) and Final week (Week 17) below — both are fully editable.
        </p>
        {degreePrograms.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Create a batch first.</p>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <select value={selectedDegree} onChange={(e) => setSelectedDegree(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                {degreePrograms.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <form onSubmit={saveSemesterDates} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Term</label><input name="termName" defaultValue={defaultTermName} style={{ width: 90 }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Year</label><input name="termYear" type="number" defaultValue={defaultTermYear} style={{ width: 80 }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Semester Start</label><input type="date" value={semesterStart} onChange={(e) => onSemesterStartChange(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Midterm Start</label><input type="date" value={midtermStart} onChange={(e) => setMidtermStart(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Midterm End</label><input type="date" value={midtermEnd} onChange={(e) => setMidtermEnd(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Final Start</label><input type="date" value={finalStart} onChange={(e) => setFinalStart(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Final End</label><input type="date" value={finalEnd} onChange={(e) => setFinalEnd(e.target.value)} /></div>
              <button type="submit" disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
            </form>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Override for a Specific Course</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>Only needed if one course genuinely has different exam weeks than the rest of its degree program.</p>
        <div style={{ marginBottom: 10 }}>
          <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
          </select>
        </div>
        {selectedCourse && (
          <form onSubmit={saveExamDates} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Midterm Start</label><input name="midtermStartDate" type="date" defaultValue={selectedCourse.midtermStartDate ? selectedCourse.midtermStartDate.slice(0, 10) : ""} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Midterm End</label><input name="midtermEndDate" type="date" defaultValue={selectedCourse.midtermEndDate ? selectedCourse.midtermEndDate.slice(0, 10) : ""} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Final Start</label><input name="finalStartDate" type="date" defaultValue={selectedCourse.finalStartDate ? selectedCourse.finalStartDate.slice(0, 10) : ""} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Final End</label><input name="finalEndDate" type="date" defaultValue={selectedCourse.finalEndDate ? selectedCourse.finalEndDate.slice(0, 10) : ""} /></div>
            <button type="submit" disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save Override"}</button>
          </form>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Holidays</h3>
        <SortableTable>
          <thead><tr><th>Date</th><th>Label</th><th></th></tr></thead>
          <tbody>
            {holidays.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {holidays.map((h) => (
              <tr key={h.id}><td>{h.date.slice(0, 10)}</td><td>{h.label}</td>
                <td><button onClick={() => removeHoliday(h.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <form onSubmit={addHoliday} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Date</label><input name="date" type="date" required /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Label</label><input name="label" placeholder="e.g. Eid Holiday" required /></div>
          <button type="submit" disabled={loading} className="btn btn-brass">Add Holiday</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Online / On-Campus Days</h3>
        <SortableTable>
          <thead><tr><th>Date</th><th>Mode</th><th></th></tr></thead>
          <tbody>
            {dayModes.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None set — days default to On-Campus.</td></tr>}
            {dayModes.map((m) => (
              <tr key={m.id}><td>{m.date.slice(0, 10)}</td><td>{m.mode === "Online" ? "Online" : "On-Campus"}</td>
                <td><button onClick={() => removeDayMode(m.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <form onSubmit={addDayMode} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Date</label><input name="date" type="date" required /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Mode</label>
            <select name="mode"><option value="Online">Online</option><option value="OnCampus">On-Campus</option></select>
          </div>
          <button type="submit" disabled={loading} className="btn btn-brass">Set Day Mode</button>
        </form>
      </div>
    </>
  );
}
