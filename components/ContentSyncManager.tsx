"use client";

import { useState, useEffect } from "react";
import ContentSyncSuggestions from "./ContentSyncSuggestions";

type Batch = { id: string; degreeProgram: string; batchName: string; startYear: number; courseCount: number };
type Course = {
  id: string; code: string; shortName: string | null; title: string; degreeProgram: string; batchName: string; batchId: string;
  semesterNumber: number | null; courseType: string; groupId: string | null; isBase: boolean | null;
};
type GroupMember = {
  courseId: string; isBase: boolean; code: string; shortName: string | null; title: string; batchId: string;
  degreeProgram: string; batchName: string; semesterNumber: number | null; courseType: string;
};
type Group = { id: string; name: string; createdByName?: string | null; members: GroupMember[] };

const TYPE_ORDER = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience", "Certification"];
function typeRank(t: string): number {
  const i = TYPE_ORDER.indexOf(t);
  return i === -1 ? TYPE_ORDER.length : i;
}

export default function ContentSyncManager() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/omc/content-sync/batches")
      .then((res) => res.json())
      .then((data) => { setBatches(data.batches || []); setBatchesLoaded(true); })
      .catch((err) => setError("Failed to load batches: " + err.message));
  }, []);

  async function loadCoursesAndGroups() {
    setCoursesLoaded(false); setError("");
    try {
      const ids = Array.from(selectedBatchIds).join(",");
      const res = await fetch(`/api/omc/content-sync?batchIds=${ids}`);
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        setError(`The server returned an unreadable response (status ${res.status}). Try selecting fewer batches at once.`);
        return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setGroups(data.groups); setCoursesLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  function toggleBatch(batchId: string) {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
    setCoursesLoaded(false);
  }

  function selectBatches(ids: string[]) {
    setSelectedBatchIds(new Set(ids));
    setCoursesLoaded(false);
  }

  // Click accumulates a selection instead of immediately pairing on the
  // second click — pick as many courses as you want across any number
  // of columns/rows, then submit them ALL at once (button or "S" key),
  // which links every one of them into a single group in one request
  // instead of one round-trip per pair.
  function handleClick(courseId: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }

  async function handleSubmitGroup() {
    if (selectedCourseIds.size < 2) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/group-multiple", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: Array.from(selectedCourseIds) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      const parts = [`Linked ${selectedCourseIds.size} courses — ${data.baseCourseCode || "one"} is the base.`];
      if (data.synced?.length > 0) parts.push(`Content copied to ${data.synced.length} course(s).`);
      if (data.skippedGraded?.length > 0) parts.push(`${data.skippedGraded.length} skipped — already have entered grades.`);
      if (data.equivalencePairsMade > 0) parts.push(`${data.equivalencePairsMade} pair(s) among them are also offered in the same term, so were combined for teaching too.`);
      setNotice(parts.join(" "));
      setSelectedCourseIds(new Set());
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleDetachSelected() {
    if (selectedCourseIds.size < 1) return;
    setBusy(true); setError(""); setNotice("");
    // One at a time, not in parallel — same reasoning as everywhere
    // else in this feature: the DB connection pool here is small, so
    // concurrent requests risk contention rather than saving time.
    const failures: string[] = [];
    let detachedCount = 0;
    for (const courseId of selectedCourseIds) {
      const course = courses.find((c) => c.id === courseId);
      if (!course?.groupId) continue; // not actually linked to anything — nothing to detach
      try {
        const res = await fetch(`/api/omc/content-sync/${course.groupId}/members/${courseId}`, { method: "DELETE" });
        if (res.ok) detachedCount++;
        else { const data = await res.json().catch(() => ({})); failures.push(`${course.code}: ${data.error || "unknown error"}`); }
      } catch (err: any) {
        failures.push(`${course.code}: ${err.message}`);
      }
    }
    setNotice(`Detached ${detachedCount} course(s).` + (failures.length > 0 ? ` Issues: ${failures.join("; ")}` : ""));
    setSelectedCourseIds(new Set());
    setBusy(false);
    await loadCoursesAndGroups();
  }

  // "S" groups the current selection, "D" detaches it — same selection,
  // two different actions, so there's no separate "mode" to enter or
  // exit; just click courses, then press whichever key does what you want.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (busy) return;
      if (e.key.toLowerCase() === "s" && selectedCourseIds.size >= 2) handleSubmitGroup();
      if (e.key.toLowerCase() === "d" && selectedCourseIds.size >= 1) handleDetachSelected();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCourseIds, busy]);

  async function handleMakeBase(groupId: string, courseId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/omc/content-sync/${groupId}/set-base`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setNotice("Base changed — this course's content now propagates to the others. Any Subject Expert previously assigned to the old base was cleared.");
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleRemove(groupId: string, courseId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await fetch(`/api/omc/content-sync/${groupId}/members/${courseId}`, { method: "DELETE" });
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  if (!batchesLoaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading batches…</p></div>;

  // Row layout: existing groups first (sorted by their base's semester +
  // type), then ungrouped courses clustered by (semester, type, title)
  // so same-named courses from different batches naturally land in the
  // same row, side by side, ready to click and pair — same visual style
  // as the Course Equivalence grid.
  const batchColumns = batches.filter((b) => selectedBatchIds.has(b.id));

  type Row = { key: string; label: string; kind: "group" | "ungrouped"; groupId?: string; semesterNumber: number | null; courseType: string; courses: (Course | GroupMember)[] };

  const groupRows: Row[] = groups.map((g) => {
    const base = g.members.find((m) => m.isBase) || g.members[0];
    return { key: `group:${g.id}`, label: g.name, kind: "group", groupId: g.id, semesterNumber: base?.semesterNumber ?? null, courseType: base?.courseType ?? "Core", courses: g.members };
  });

  const ungroupedCourses = courses.filter((c) => !c.groupId);
  const ungroupedClusters = new Map<string, Course[]>();
  for (const c of ungroupedCourses) {
    const clusterKey = `${c.semesterNumber}|${c.courseType}|${c.title.trim().toLowerCase()}`;
    if (!ungroupedClusters.has(clusterKey)) ungroupedClusters.set(clusterKey, []);
    ungroupedClusters.get(clusterKey)!.push(c);
  }
  const ungroupedRows: Row[] = Array.from(ungroupedClusters.entries()).map(([key, cs]) => ({
    key: `ungrouped:${key}`, label: cs[0].title, kind: "ungrouped", semesterNumber: cs[0].semesterNumber, courseType: cs[0].courseType, courses: cs,
  }));

  const allRows = [...groupRows, ...ungroupedRows].sort((a, b) =>
    (a.semesterNumber ?? 999) - (b.semesterNumber ?? 999) || typeRank(a.courseType) - typeRank(b.courseType) || a.label.localeCompare(b.label)
  );

  function coursesInCell(row: Row, batchId: string): (Course | GroupMember)[] {
    return row.courses.filter((c) => c.batchId === batchId);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12.5, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 8 }}>
          Check which batches to work with — only the last 4 admission years are listed, and only what you check
          gets loaded below.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--slate)" }}>Quick select:</span>
          <button onClick={() => selectBatches(batches.map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
            All
          </button>
          {Array.from(new Set(batches.map((b) => b.degreeProgram))).map((program) => (
            <button key={program} onClick={() => selectBatches(batches.filter((b) => b.degreeProgram === program).map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
              {program}
            </button>
          ))}
          {Array.from(new Set(batches.map((b) => b.startYear))).sort((a, b) => b - a).map((year) => (
            <button key={year} onClick={() => selectBatches(batches.filter((b) => b.startYear === year).map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
              {year}
            </button>
          ))}
          <button onClick={() => selectBatches([])} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
            None
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          {batches.map((b) => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--line)", padding: "4px 8px" }}>
              <input type="checkbox" checked={selectedBatchIds.has(b.id)} onChange={() => toggleBatch(b.id)} />
              {b.degreeProgram} — {b.batchName} ({b.courseCount})
            </label>
          ))}
          {batches.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No batches yet.</p>}
        </div>
        <button onClick={loadCoursesAndGroups} disabled={selectedBatchIds.size === 0} className="btn btn-brass" style={{ fontSize: 12.5 }}>
          Load courses for checked batches
        </button>
      </div>

      {coursesLoaded && (
        <>
          <ContentSyncSuggestions batchIds={Array.from(selectedBatchIds)} onLinked={loadCoursesAndGroups} />

          <div className="card" style={{ overflowX: "auto" }}>
            <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>
              Click any number of courses to select them (any batch, any semester, even several from the same
              batch), then click "Group Selected" or press <b>S</b> to link them all at once into one group, or
              click "Detach Selected" / press <b>D</b> to unlink whichever of the selected courses are
              currently linked — whichever is from the most senior batch becomes the <b>base</b> (tie broken by
              Computer Science &gt; Software Engineering &gt; Artificial Intelligence &gt; Cyber Security &gt;
              Data Science). If any selected course is already a group's base, that group is reused and the
              rest merge into it. Rows are sorted by semester, then course type, so related courses line up
              together. (Double-click a single linked course to unlink just that one, without selecting first.)
            </p>
            {selectedCourseIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, background: "#F5F3FF", padding: 8, border: "1px solid var(--brass)" }}>
                <span style={{ fontSize: 12, color: "var(--brass-dark)" }}>{selectedCourseIds.size} course(s) selected.</span>
                <button onClick={handleSubmitGroup} disabled={selectedCourseIds.size < 2 || busy} className="btn btn-brass" style={{ fontSize: 11.5, padding: "4px 10px" }}>
                  Group Selected ({selectedCourseIds.size}) — or press S
                </button>
                <button onClick={handleDetachSelected} disabled={selectedCourseIds.size < 1 || busy} style={{ fontSize: 11.5, padding: "4px 10px", border: "1px solid var(--rust)", background: "#fff", color: "var(--rust)" }}>
                  Detach Selected — or press D
                </button>
                <button onClick={() => setSelectedCourseIds(new Set())} style={{ fontSize: 11.5, padding: "4px 10px", border: "1px solid var(--line)", background: "#fff" }}>
                  Clear
                </button>
              </div>
            )}
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 140, textAlign: "left", fontSize: 11, padding: 4 }}>Course</th>
                  {batchColumns.map((b) => (
                    <th key={b.id} style={{ minWidth: 170, textAlign: "left", fontSize: 11, padding: 4 }}>{b.degreeProgram} — {b.batchName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((row, idx) => {
                  const prevRow = allRows[idx - 1];
                  const newSemester = idx > 0 && prevRow.semesterNumber !== row.semesterNumber;
                  return (
                    <tr key={row.key} style={{ borderTop: newSemester ? "2px solid var(--line)" : undefined }}>
                      <td style={{ fontSize: 10.5, color: "var(--slate)", padding: 4, verticalAlign: "top" }}>
                        {idx === 0 || newSemester ? <b style={{ color: "var(--ink)" }}>Sem {row.semesterNumber ?? "?"}</b> : null}
                        <div>{row.courseType}</div>
                        <div style={{ fontStyle: "italic" }}>{row.label}</div>
                      </td>
                      {batchColumns.map((b) => {
                        const cellCourses = coursesInCell(row, b.id);
                        return (
                          <td key={b.id} style={{ padding: 4, verticalAlign: "top" }}>
                            {cellCourses.map((c) => {
                              const cId = (c as Course).id || (c as GroupMember).courseId;
                              const isSelected = selectedCourseIds.has(cId);
                              const cIsBase = (c as Course).isBase ?? (c as GroupMember).isBase;
                              return (
                                <div
                                  key={cId}
                                  onClick={() => !busy && handleClick(cId)}
                                  onDoubleClick={() => row.kind === "group" && row.groupId && !busy && handleRemove(row.groupId, cId)}
                                  title={`${c.code} — ${c.title}`}
                                  style={{
                                    cursor: "pointer", padding: "3px 6px", marginBottom: 2, fontSize: 11.5,
                                    background: isSelected ? "#E8E6FB" : row.kind === "group" ? "#FEF3C7" : undefined,
                                    border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                                  }}
                                >
                                  {cIsBase && <span style={{ fontSize: 8.5, background: "var(--sage)", color: "#fff", padding: "0 4px", borderRadius: 2, marginRight: 4 }}>BASE</span>}
                                  {c.shortName || c.code}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
