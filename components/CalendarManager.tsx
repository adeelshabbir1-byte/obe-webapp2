"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Holiday = { id: string; date: string; label: string };
type DayMode = { id: string; date: string; mode: string };
type Course = { id: string; code: string; title: string; midtermDate: string | null; finalDate: string | null };

export default function CalendarManager({ initialHolidays, initialDayModes, courses }: {
  initialHolidays: Holiday[]; initialDayModes: DayMode[]; courses: Course[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "");

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
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeHoliday(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/holidays/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
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
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeDayMode(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/class-day-modes/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function saveExamDates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coordinator/courses/${selectedCourseId}/exam-dates`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midtermDate: fd.get("midtermDate") || null, finalDate: fd.get("finalDate") || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Midterm & Final Exam Dates</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>No lecture auto-fills onto a course's exam dates.</p>
        <div style={{ marginBottom: 10 }}>
          <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
          </select>
        </div>
        {selectedCourse && (
          <form onSubmit={saveExamDates} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Midterm Date</label><input name="midtermDate" type="date" defaultValue={selectedCourse.midtermDate ? selectedCourse.midtermDate.slice(0, 10) : ""} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Final Date</label><input name="finalDate" type="date" defaultValue={selectedCourse.finalDate ? selectedCourse.finalDate.slice(0, 10) : ""} /></div>
            <button type="submit" disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
          </form>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Holidays</h3>
        <table>
          <thead><tr><th>Date</th><th>Label</th><th></th></tr></thead>
          <tbody>
            {initialHolidays.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {initialHolidays.map((h) => (
              <tr key={h.id}><td>{h.date.slice(0, 10)}</td><td>{h.label}</td>
                <td><button onClick={() => removeHoliday(h.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addHoliday} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Date</label><input name="date" type="date" required /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Label</label><input name="label" placeholder="e.g. Eid Holiday" required /></div>
          <button type="submit" disabled={loading} className="btn btn-brass">Add Holiday</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Online / On-Campus Days</h3>
        <table>
          <thead><tr><th>Date</th><th>Mode</th><th></th></tr></thead>
          <tbody>
            {initialDayModes.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None set — days default to On-Campus.</td></tr>}
            {initialDayModes.map((m) => (
              <tr key={m.id}><td>{m.date.slice(0, 10)}</td><td>{m.mode === "Online" ? "Online" : "On-Campus"}</td>
                <td><button onClick={() => removeDayMode(m.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
