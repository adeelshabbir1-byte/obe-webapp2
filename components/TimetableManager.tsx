"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Room = { id: string; name: string; type: string; capacity: number };
type Batch = { id: string; label: string; workingDays: string[]; dailyStartHour: number; dailyEndHour: number };
type Faculty = { id: string; name: string };
type Section = { id: string; courseCode: string; courseTitle: string; batchLabel: string; instructorId: string; instructorName: string; sectionLabel: string; sessionsPerWeek: number; sessionDurationMinutes: number; roomTypeNeeded: string };
type Entry = { id: string; day: string; startHour: number; endHour: number; roomName: string; roomType: string; courseCode: string; courseTitle: string; sectionLabel: string; instructorId: string; instructorName: string; batchId: string; batchLabel: string; roomId: string };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TABS = ["Rooms", "Batch Schedules", "Sections", "Faculty Availability", "Generate & View"] as const;

function formatHour(h: number) {
  const hour = Math.floor(h), min = Math.round((h - hour) * 60);
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

export default function TimetableManager({ rooms: initialRooms, batches, faculty, latestRunId }: {
  rooms: Room[]; batches: Batch[]; faculty: Faculty[]; latestRunId: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<typeof TABS[number]>("Rooms");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Rooms
  const [rooms, setRooms] = useState(initialRooms);
  async function addRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/rooms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), type: fd.get("type"), capacity: fd.get("capacity") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRooms((prev) => [...prev, data.room]); (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }
  async function removeRoom(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/rooms/${id}`, { method: "DELETE" });
    setRooms((prev) => prev.filter((r) => r.id !== id)); setLoading(false);
  }

  // Batch schedule config
  const [batchConfigs, setBatchConfigs] = useState(batches);
  async function saveBatchConfig(batchId: string, days: string[], start: number, end: number) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/batch-schedule-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, workingDays: days, dailyStartHour: start, dailyEndHour: end }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setBatchConfigs((prev) => prev.map((b) => (b.id === batchId ? { ...b, workingDays: days, dailyStartHour: start, dailyEndHour: end } : b)));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  // Schedule sections
  const [sections, setSections] = useState<Section[]>([]);
  async function loadSections() {
    const res = await fetch("/api/coordinator/schedule-sections");
    const data = await res.json();
    setSections(data.sections || []);
  }
  useEffect(() => { loadSections(); }, []);

  async function autoGenerateSections() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/schedule-sections/auto-generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      await loadSections(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }
  async function updateSection(id: string, field: string, value: string) {
    setLoading(true);
    await fetch(`/api/coordinator/schedule-sections/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }),
    });
    await loadSections(); setLoading(false);
  }
  async function removeSection(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/schedule-sections/${id}`, { method: "DELETE" });
    await loadSections(); setLoading(false);
  }

  // Faculty availability (PC-set)
  const [unavailability, setUnavailability] = useState<any[]>([]);
  const [unavailFacultyId, setUnavailFacultyId] = useState(faculty[0]?.id || "");
  async function loadUnavailability() {
    const res = await fetch("/api/coordinator/faculty-unavailability");
    const data = await res.json();
    setUnavailability(data.records || []);
  }
  useEffect(() => { loadUnavailability(); }, []);

  async function addUnavailability(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/faculty-unavailability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facultyId: unavailFacultyId, dayOfWeek: fd.get("dayOfWeek"), startHour: fd.get("startHour"), endHour: fd.get("endHour"), note: fd.get("note") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      await loadUnavailability(); (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }
  async function removeUnavailability(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/faculty-unavailability/${id}`, { method: "DELETE" });
    await loadUnavailability(); setLoading(false);
  }

  // Generate & view
  const [generating, setGenerating] = useState(false);
  const [runId, setRunId] = useState<string | null>(latestRunId);
  const [runInfo, setRunInfo] = useState<{ hardViolations: number; generations: number; notes: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewMode, setViewMode] = useState<"batch" | "instructor" | "room" | "course">("batch");
  const [viewFilter, setViewFilter] = useState("");

  async function loadRun(id: string) {
    const res = await fetch(`/api/coordinator/timetable/${id}`);
    const data = await res.json();
    if (res.ok) { setEntries(data.entries || []); setRunInfo(data.run); }
  }
  useEffect(() => { if (runId) loadRun(runId); }, []);

  async function generate() {
    setGenerating(true); setError("");
    try {
      const res = await fetch("/api/coordinator/timetable/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setGenerating(false); return; }
      setRunId(data.runId); await loadRun(data.runId); setGenerating(false); setTab("Generate & View"); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setGenerating(false); }
  }

  const groupKeyFor = (e: Entry) => (viewMode === "batch" ? e.batchLabel : viewMode === "instructor" ? e.instructorName : viewMode === "room" ? e.roomName : `${e.courseCode} — ${e.courseTitle}`);
  const groups = Array.from(new Set(entries.map(groupKeyFor))).sort();
  const filteredEntries = viewFilter ? entries.filter((e) => groupKeyFor(e) === viewFilter) : entries;

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", fontSize: 12.5, cursor: "pointer", border: "1px solid var(--line)", background: tab === t ? "var(--brass)" : "transparent", color: tab === t ? "#fff" : "var(--ink)" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Rooms" && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Rooms & Labs</h3>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th></th></tr></thead>
            <tbody>
              {rooms.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td><td>{r.type}</td><td>{r.capacity}</td>
                  <td><button onClick={() => removeRoom(r.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addRoom} style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "flex-end" }}>
            <div className="field" style={{ margin: 0 }}><label>Name</label><input name="name" placeholder="e.g. Room 204" required /></div>
            <div className="field" style={{ margin: 0 }}>
              <label>Type</label>
              <select name="type"><option value="LECTURE">Lecture Room</option><option value="LAB">Lab</option></select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>Capacity</label><input name="capacity" type="number" min={1} style={{ width: 90 }} required /></div>
            <button className="btn btn-brass" type="submit" disabled={loading}>Add Room</button>
          </form>
        </div>
      )}

      {tab === "Batch Schedules" && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Per-Batch Scheduling Window</h3>
          {batchConfigs.map((b) => (
            <div key={b.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{b.label}</p>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DAYS.map((d) => (
                    <label key={d} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" checked={b.workingDays.includes(d)} onChange={(e) => {
                        const newDays = e.target.checked ? [...b.workingDays, d] : b.workingDays.filter((x) => x !== d);
                        setBatchConfigs((prev) => prev.map((x) => (x.id === b.id ? { ...x, workingDays: newDays } : x)));
                      }} />
                      {d}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 11.5 }}>Start</label>
                  <input type="number" min={0} max={23} value={b.dailyStartHour} onChange={(e) => setBatchConfigs((prev) => prev.map((x) => (x.id === b.id ? { ...x, dailyStartHour: parseInt(e.target.value, 10) } : x)))} style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)" }} />
                  <label style={{ fontSize: 11.5 }}>End</label>
                  <input type="number" min={0} max={23} value={b.dailyEndHour} onChange={(e) => setBatchConfigs((prev) => prev.map((x) => (x.id === b.id ? { ...x, dailyEndHour: parseInt(e.target.value, 10) } : x)))} style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)" }} />
                </div>
                <button onClick={() => saveBatchConfig(b.id, b.workingDays, b.dailyStartHour, b.dailyEndHour)} disabled={loading} className="btn btn-brass" style={{ padding: "4px 12px", fontSize: 11.5 }}>Save</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Sections" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Schedulable Sections</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>One row per (course, instructor) pair that needs a time slot. Auto-generate from your offered courses, then adjust sessions/week, duration, or room type as needed.</p>
          <button onClick={autoGenerateSections} disabled={loading} className="btn btn-brass" style={{ marginBottom: 12 }}>Auto-Generate from Offered Courses</button>
          <table>
            <thead><tr><th>Course</th><th>Batch</th><th>Instructor</th><th>Section</th><th>Sessions/Week</th><th>Duration (min)</th><th>Room Type</th><th></th></tr></thead>
            <tbody>
              {sections.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>None yet — click "Auto-Generate" above.</td></tr>}
              {sections.map((s) => (
                <tr key={s.id}>
                  <td>{s.courseCode}</td><td style={{ fontSize: 11 }}>{s.batchLabel}</td><td>{s.instructorName}</td><td>{s.sectionLabel}</td>
                  <td><input type="number" min={1} defaultValue={s.sessionsPerWeek} onBlur={(e) => updateSection(s.id, "sessionsPerWeek", e.target.value)} style={{ width: 50, padding: "3px 5px", border: "1px solid var(--line)" }} /></td>
                  <td><input type="number" min={30} step={15} defaultValue={s.sessionDurationMinutes} onBlur={(e) => updateSection(s.id, "sessionDurationMinutes", e.target.value)} style={{ width: 60, padding: "3px 5px", border: "1px solid var(--line)" }} /></td>
                  <td>
                    <select defaultValue={s.roomTypeNeeded} onChange={(e) => updateSection(s.id, "roomTypeNeeded", e.target.value)} style={{ padding: "3px 5px", border: "1px solid var(--line)" }}>
                      <option value="LECTURE">Lecture</option><option value="LAB">Lab</option>
                    </select>
                  </td>
                  <td><button onClick={() => removeSection(s.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Faculty Availability" && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Faculty Unavailability (set by you, as Coordinator)</h3>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}>Faculty can also mark their own unavailability from their own account — both feed the same generator.</p>
          <table>
            <thead><tr><th>Faculty</th><th>Day</th><th>Time</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {unavailability.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>None set.</td></tr>}
              {unavailability.map((u: any) => (
                <tr key={u.id}>
                  <td>{faculty.find((f) => f.id === u.facultyId)?.name || "—"}</td><td>{u.dayOfWeek}</td>
                  <td>{formatHour(u.startHour)}–{formatHour(u.endHour)}</td><td>{u.note || "—"}</td>
                  <td><button onClick={() => removeUnavailability(u.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addUnavailability} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Faculty</label>
              <select value={unavailFacultyId} onChange={(e) => setUnavailFacultyId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Day</label>
              <select name="dayOfWeek">{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>Start Hour</label><input name="startHour" type="number" min={0} max={23} defaultValue={8} style={{ width: 70 }} /></div>
            <div className="field" style={{ margin: 0 }}><label>End Hour</label><input name="endHour" type="number" min={0} max={23} defaultValue={9} style={{ width: 70 }} /></div>
            <div className="field" style={{ margin: 0 }}><label>Note (optional)</label><input name="note" placeholder="e.g. Faculty meeting" /></div>
            <button className="btn btn-brass" type="submit" disabled={loading}>Add</button>
          </form>
        </div>
      )}

      {tab === "Generate & View" && (
        <>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Generate Timetable</h3>
            <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
              Runs a genetic algorithm across all your rooms, sections, and faculty availability. May take up to a minute for larger institutions.
            </p>
            <button onClick={generate} disabled={generating} className="btn btn-brass">{generating ? "Generating… this may take a minute" : "Generate Timetable"}</button>
            {runInfo && (
              <p style={{ fontSize: 12.5, marginTop: 12, color: runInfo.hardViolations > 0 ? "var(--rust)" : "var(--sage)" }}>
                {runInfo.notes} ({runInfo.generations} generation(s) run)
              </p>
            )}
          </div>

          {entries.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Sub-Timetable View</h3>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <select value={viewMode} onChange={(e) => { setViewMode(e.target.value as any); setViewFilter(""); }} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                  <option value="batch">By Batch / Degree Program</option>
                  <option value="instructor">By Instructor</option>
                  <option value="room">By Room</option>
                  <option value="course">By Course</option>
                </select>
                <select value={viewFilter} onChange={(e) => setViewFilter(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", minWidth: 200 }}>
                  <option value="">— All —</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <table>
                <thead><tr><th>Day</th><th>Time</th><th>Course</th><th>Section</th><th>Instructor</th><th>Batch</th><th>Room</th></tr></thead>
                <tbody>
                  {filteredEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.day}</td><td>{formatHour(e.startHour)}–{formatHour(e.endHour)}</td>
                      <td>{e.courseCode} — {e.courseTitle}</td><td>{e.sectionLabel}</td><td>{e.instructorName}</td>
                      <td style={{ fontSize: 11 }}>{e.batchLabel}</td><td>{e.roomName} ({e.roomType})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
