"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import AvailabilityGrid from "./AvailabilityGrid";
import LocalSolutionUploader from "./LocalSolutionUploader";

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

  // Faculty availability (PC-set) — per-faculty grid
  const [unavailFacultyId, setUnavailFacultyId] = useState(faculty[0]?.id || "");
  const [facultyUnavailable, setFacultyUnavailable] = useState<{ dayOfWeek: string; startHour: number; endHour: number }[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);

  async function loadFacultyUnavailability(facultyId: string) {
    setLoadingGrid(true);
    const res = await fetch(`/api/coordinator/faculty-unavailability?facultyId=${facultyId}`);
    const data = await res.json();
    setFacultyUnavailable(data.records || []);
    setLoadingGrid(false);
  }
  useEffect(() => { if (unavailFacultyId) loadFacultyUnavailability(unavailFacultyId); }, []);

  // Generate & view
  const [generating, setGenerating] = useState(false);
  const [runId, setRunId] = useState<string | null>(latestRunId);
  const [runInfo, setRunInfo] = useState<{ hardViolations: number; generations: number; notes: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clashInfo, setClashInfo] = useState<{ entryIds: string[]; reasons: string[] } | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"batch" | "instructor" | "room" | "course">("batch");
  const [viewFilter, setViewFilter] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [runStatus, setRunStatus] = useState<"IDLE" | "RUNNING" | "COMPLETED" | "STOPPED">("IDLE");
  const pollingRef = { current: false } as { current: boolean };

  async function loadRun(id: string) {
    const res = await fetch(`/api/coordinator/timetable/${id}`);
    const data = await res.json();
    if (res.ok) { setEntries(data.entries || []); setRunInfo(data.run); }
  }
  useEffect(() => { if (runId) loadRun(runId); }, []);

  async function moveEntry(entryId: string, day: string, startHour: number) {
    if (!runId) return;
    setMovingEntryId(entryId); setError(""); setClashInfo(null);
    try {
      const res = await fetch(`/api/coordinator/timetable/${runId}/entries/${entryId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, startHour }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setMovingEntryId(null); return; }
      if (data.clashes) setClashInfo({ entryIds: [...data.clashes.entryIds, entryId], reasons: data.clashes.reasons });
      await loadRun(runId);
      setMovingEntryId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setMovingEntryId(null); }
  }

  async function pollLoop(id: string) {
    pollingRef.current = true;
    let consecutiveFailures = 0;
    while (pollingRef.current) {
      let data: any;
      try {
        const res = await fetch(`/api/coordinator/timetable/${id}/continue`, { method: "POST" });
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
        if (!res.ok || !data) {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            setError("The server stopped responding mid-generation (likely a hosting time limit on each step) — try again with a shorter 'max run time', or check what's been saved so far below.");
            setGenerating(false); await loadRun(id); break;
          }
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
      } catch (err: any) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          setError("Lost connection to the server while generating — try again with a shorter 'max run time'.");
          setGenerating(false); await loadRun(id); break;
        }
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      consecutiveFailures = 0;
      setRunInfo({ hardViolations: data.hardViolations, generations: data.generations, notes: "" });
      setProgressPct(data.percentTimeUsed ?? 0);
      if (data.status === "COMPLETED" || data.status === "STOPPED") {
        setRunStatus(data.status); setGenerating(false); await loadRun(id); router.refresh(); break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async function generate() {
    setGenerating(true); setError(""); setProgressPct(0); setRunStatus("RUNNING");
    try {
      const res = await fetch("/api/coordinator/timetable/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxMinutes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setGenerating(false); return; }
      setRunId(data.runId); setTab("Generate & View");
      pollLoop(data.runId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setGenerating(false); }
  }

  async function stopNow() {
    if (!runId) return;
    pollingRef.current = false;
    setGenerating(false);
    const res = await fetch(`/api/coordinator/timetable/${runId}/stop`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { setRunStatus(data.status); await loadRun(runId); router.refresh(); }
  }

  const groupKeyFor = (e: Entry) => (viewMode === "batch" ? e.batchLabel : viewMode === "instructor" ? e.instructorName : viewMode === "room" ? e.roomName : `${e.courseCode} — ${e.courseTitle}`);
  const groups = Array.from(new Set(entries.map(groupKeyFor))).sort();
  const filteredEntries = viewFilter ? entries.filter((e) => groupKeyFor(e) === viewFilter) : entries;

  const GRID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const usedDays = GRID_DAYS.filter((d) => filteredEntries.some((e) => e.day === d));

  // Half-hour columns spanning the full range actually used.
  const minStart = filteredEntries.length > 0 ? Math.min(...filteredEntries.map((e) => e.startHour)) : 8;
  const maxEnd = filteredEntries.length > 0 ? Math.max(...filteredEntries.map((e) => e.endHour)) : 17;
  const timeColumns: number[] = [];
  for (let t = minStart; t < maxEnd; t += 0.5) timeColumns.push(t);

  // Greedy lane assignment per day, so overlapping sessions (e.g. viewing
  // "All" with no filter, where two different rooms run in parallel) get
  // their own sub-row instead of colliding in one.
  function laneAssign(entries: Entry[]): Entry[][] {
    const sorted = [...entries].sort((a, b) => a.startHour - b.startHour);
    const lanes: Entry[][] = [];
    for (const e of sorted) {
      let placed = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (e.startHour >= last.endHour) { lane.push(e); placed = true; break; }
      }
      if (!placed) lanes.push([e]);
    }
    return lanes;
  }
  const lanesByDay = new Map<string, Entry[][]>();
  for (const d of usedDays) lanesByDay.set(d, laneAssign(filteredEntries.filter((e) => e.day === d)));

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
        <>
          <div className="card">
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Faculty Member</label>
            <select value={unavailFacultyId} onChange={(e) => { setUnavailFacultyId(e.target.value); loadFacultyUnavailability(e.target.value); }} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
              {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {loadingGrid ? (
            <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p></div>
          ) : (
            <AvailabilityGrid facultyId={unavailFacultyId} existingUnavailable={facultyUnavailable} />
          )}
        </>
      )}

      {tab === "Generate & View" && (
        <>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Option A: Generate Locally on Your PC (recommended for larger institutions)</h3>
            <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
              Download your current setup as an Excel file, run the desktop tool on your own computer (no time
              limit), then upload the solution file it produces.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/api/coordinator/timetable/download-constraints" className="btn btn-brass" style={{ textDecoration: "none" }}>1. Download Constraints (Excel)</a>
              <LocalSolutionUploader />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Option B: Generate on the Web App</h3>
            <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
              Runs a genetic algorithm in the background, searching for a clash-free schedule. It keeps improving
              until it finds a perfect result or the time limit is reached — you can also accept the current best
              early.
            </p>
            {!generating && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Max run time (minutes)</label>
                  <input type="number" min={1} max={30} value={maxMinutes} onChange={(e) => setMaxMinutes(parseInt(e.target.value, 10) || 30)} style={{ width: 80, padding: "6px 8px", border: "1px solid var(--line)" }} />
                </div>
                <button onClick={generate} className="btn btn-brass">Generate Timetable</button>
              </div>
            )}
            {generating && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ background: "var(--line)", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ background: "var(--brass)", height: "100%", width: `${progressPct}%`, transition: "width .3s" }} />
                </div>
                <p style={{ fontSize: 12, color: "var(--slate)" }}>
                  Searching… {progressPct}% of time budget used
                  {runInfo && ` — best so far: ${runInfo.hardViolations} clash(es), ${runInfo.generations} generation(s)`}
                </p>
                <button onClick={stopNow} style={{ marginTop: 8, background: "none", border: "1px solid var(--rust)", color: "var(--rust)", padding: "5px 14px", fontSize: 12, cursor: "pointer" }}>Stop Now & Use Current Best</button>
              </div>
            )}
            {!generating && runInfo && (
              <p style={{ fontSize: 12.5, color: (runInfo.hardViolations || 0) > 0 ? "var(--rust)" : "var(--sage)" }}>
                {(runInfo.hardViolations || 0) > 0 ? `${runInfo.hardViolations} clash(es) remain` : "Clash-free!"} after {runInfo.generations} generation(s).
              </p>
            )}
          </div>

          {entries.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <h3 style={{ fontSize: 14 }}>Timetable</h3>
                {runId && <a href={`/api/coordinator/timetable/${runId}/export`} className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>}
              </div>
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
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: "var(--card)", zIndex: 2 }}>Day</th>
                    {timeColumns.map((t) => <th key={t} style={{ fontSize: 10, whiteSpace: "nowrap", padding: "4px 2px" }}>{formatHour(t)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {usedDays.map((d) => {
                    const lanes = lanesByDay.get(d) || [];
                    return lanes.map((lane, laneIdx) => {
                      const cells: ReactNode[] = [];
                      let col = 0;
                      while (col < timeColumns.length) {
                        const t = timeColumns[col];
                        const entry = lane.find((e) => e.startHour === t);
                        if (entry) {
                          const span = Math.round((entry.endHour - entry.startHour) / 0.5);
                          const isClashing = clashInfo?.entryIds.includes(entry.id);
                          cells.push(
                            <td key={t} colSpan={span} style={{ fontSize: 11, verticalAlign: "top", padding: 3 }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); if (draggedEntryId && draggedEntryId !== entry.id) moveEntry(draggedEntryId, d, t); }}>
                              <div
                                draggable={!movingEntryId}
                                onDragStart={() => setDraggedEntryId(entry.id)}
                                onDragEnd={() => setDraggedEntryId(null)}
                                title={isClashing ? clashInfo?.reasons.join("; ") : "Drag to move"}
                                style={{
                                  padding: 4, borderRadius: 3, cursor: movingEntryId ? "wait" : "grab",
                                  background: isClashing ? "#FFE4DC" : "#F0EDFB",
                                  border: isClashing ? "1.5px solid var(--rust)" : "1px solid transparent",
                                  opacity: movingEntryId === entry.id ? 0.5 : 1,
                                }}
                              >
                                <b>{entry.courseCode}</b> ({entry.sectionLabel})<br />
                                {formatHour(entry.startHour)}–{formatHour(entry.endHour)}<br />
                                {entry.instructorName}<br />{entry.roomName} · {entry.batchLabel}
                                {isClashing && <div style={{ color: "var(--rust)", fontWeight: 700, marginTop: 2 }}>⚠ CLASH</div>}
                              </div>
                            </td>
                          );
                          col += span;
                        } else {
                          cells.push(
                            <td key={t}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); if (draggedEntryId) moveEntry(draggedEntryId, d, t); }}
                            />
                          );
                          col += 1;
                        }
                      }
                      return (
                        <tr key={`${d}-${laneIdx}`}>
                          {laneIdx === 0 && <td rowSpan={lanes.length} style={{ fontWeight: 600, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>{d}</td>}
                          {cells}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>
                Each column is a 30-minute slot. A theory session (1.5hr) spans 3 columns; a lab session (3hr)
                spans 6. If a day shows more than one row, those sessions run in parallel (different rooms).
                Drag a session to a new time to move it — a clash it creates (same room, instructor, or batch
                double-booked) is highlighted in red on both sessions involved.
              </p>
              {clashInfo && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--rust)" }}>
                  <b>This move created a clash:</b> {clashInfo.reasons.join("; ")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
