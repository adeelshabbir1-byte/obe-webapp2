"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Row = { kind: "course" | "group"; id: string; code: string | null; label: string; title: string; courseType: string; batchLabel: string; customCategoryName: string | null; studentCount: number; sectionsNeeded: number; assignments: Record<string, number> };
type Instructor = { id: string; name: string; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null; specialization: string | null; customCategoryName: string | null; dominantType: string | null };

const PRIORITY_COLORS: Record<number, string> = { 1: "#BDEBD6", 2: "#FFF3DC", 3: "#FFE0B2" };
const PRIORITY_LABELS: Record<number, string> = { 1: "Top priority", 2: "Good", 3: "Neutral/50-50" };

// "Available" = workload capacity remaining, not a time-slot check:
// normalLoad minus what's already assigned to them in this matrix plus
// their external load (taught elsewhere, not tracked here). E.g. a
// load of 3 with 2 sections assigned so far shows "available for 1
// more section."
function availabilityLevel(i: Instructor, assignedSoFar: number): { label: string; color: string; fg: string; remaining: number } {
  const remaining = i.normalLoad - assignedSoFar - i.externalLoadCount;
  if (remaining > 0) return { label: `Available for ${remaining} more section${remaining === 1 ? "" : "s"}`, color: "#E3F8EF", fg: "var(--sage)", remaining };
  if (remaining === 0) return { label: "At full load (0 sections remaining)", color: "#FFF3DC", fg: "#8A4B00", remaining };
  return { label: `Overloaded by ${-remaining} section${-remaining === 1 ? "" : "s"}`, color: "#FFE8ED", fg: "var(--rust)", remaining };
}

function specializationMatches(row: Row, instructor: Instructor): boolean {
  if (row.courseType !== "Elective" || !instructor.specialization) return false;
  const spec = instructor.specialization.toLowerCase().trim();
  const title = row.title.toLowerCase();
  return spec.length > 2 && (title.includes(spec) || spec.includes(title));
}

export default function AssignmentMatrix() {
  const [rows, setRows] = useState<Row[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [priorities, setPriorities] = useState<Record<string, Record<string, number>>>({});
  const [shortNames, setShortNames] = useState<Record<string, string>>({});
  const [uncoveredCodes, setUncoveredCodes] = useState<string[]>([]);
  const [strongCodes, setStrongCodes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyCell, setBusyCell] = useState<string | null>(null);

  // Column visibility for the left-side info columns — Course and the
  // section-progress figure stay on by default; Type/Batch/Students are
  // off by default since most day-to-day assigning only needs the name.
  const [showType, setShowType] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [showProgress, setShowProgress] = useState(true);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const [courseFilter, setCourseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState("");
  const [instructorCategoryFilter, setInstructorCategoryFilter] = useState("");
  const [hiddenInstructorIds, setHiddenInstructorIds] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await fetch("/api/assigner/matrix");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setRows(data.rows); setInstructors(data.instructors);
      setPriorities(data.priorities || {}); setUncoveredCodes(data.uncoveredCodes || []); setStrongCodes(data.strongCodes || []);
      setShortNames(data.shortNames || {});
      setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/assigner/matrix/import-grid", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed."); setImporting(false); return; }
      setImportResult(data);
      await load();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function setCount(row: Row, instructorId: string, sectionCount: number) {
    const currentValue = row.assignments[instructorId] || 0;
    const currentTotal = Object.values(row.assignments).reduce((a, b) => a + b, 0);
    const newTotal = currentTotal - currentValue + sectionCount;
    if (newTotal > row.sectionsNeeded) {
      const proceed = confirm(`${row.label} only needs ${row.sectionsNeeded} section(s), but this would assign ${newTotal} total across all faculty. Continue anyway?`);
      if (!proceed) return;
    }

    const key = row.id + instructorId;
    setBusyCell(key); setError("");
    try {
      const res = await fetch("/api/assigner/matrix/set-count", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, id: row.id, instructorId, sectionCount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyCell(null); return; }
      await load();
      setBusyCell(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  function totalFor(instructorId: string) {
    return rows.reduce((sum, r) => sum + (r.assignments[instructorId] || 0), 0);
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  if (rows.length === 0) {
    return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses currently offered — ask the Program Coordinator to offer this semester's courses first.</p></div>;
  }
  if (instructors.length === 0) {
    return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No Course Instructors onboarded yet.</p></div>;
  }

  // Filter by search text (code or title), course type, and/or batch —
  // lets an Assigner work through one slice at a time (e.g. Core now,
  // IDS/Elective in a later pass), then sort so fully-assigned
  // ("settled") rows sink toward the bottom — pending ones stay near the
  // top, closest to the course-name column, where attention is needed.
  const courseTypes = Array.from(new Set(rows.map((r) => r.courseType))).sort();
  const batchLabels = Array.from(new Set(rows.map((r) => r.batchLabel))).sort();
  const courseCategories = Array.from(new Set(rows.map((r) => r.customCategoryName).filter((c): c is string => !!c))).sort();
  const filteredRows = rows.filter((r) => {
    if (typeFilter && r.courseType !== typeFilter) return false;
    if (batchFilter && r.batchLabel !== batchFilter) return false;
    if (categoryFilter && r.customCategoryName !== categoryFilter) return false;
    if (!courseFilter.trim()) return true;
    const q = courseFilter.trim().toLowerCase();
    return r.label.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q);
  });
  const isRowSettled = (r: Row) => Object.values(r.assignments).reduce((a, b) => a + b, 0) >= r.sectionsNeeded;
  const sortedRows = [...filteredRows].sort((a, b) => {
    const as = isRowSettled(a), bs = isRowSettled(b);
    if (as !== bs) return as ? 1 : -1;
    return 0; // stable sort — preserves existing type-grouping within each partition
  });

  // Same idea for instructors: whoever's already at/over their normal load
  // moves toward the end (right side); those with room left stay near the
  // course names on the left, where they're easiest to assign to next.
  const specializations = Array.from(new Set(instructors.map((i) => i.specialization).filter((s): s is string => !!s))).sort();
  const instructorCategories = Array.from(new Set(instructors.map((i) => i.customCategoryName).filter((c): c is string => !!c))).sort();
  const visibleInstructors = instructors.filter((i) => {
    if (hiddenInstructorIds.has(i.id)) return false;
    if (specializationFilter && i.specialization !== specializationFilter) return false;
    if (instructorCategoryFilter && i.customCategoryName !== instructorCategoryFilter) return false;
    return true;
  });
  const isInstructorSettled = (i: Instructor) => totalFor(i.id) + i.externalLoadCount >= i.normalLoad;
  const sortedInstructors = [...visibleInstructors].sort((a, b) => {
    const as = isInstructorSettled(a), bs = isInstructorSettled(b);
    if (as !== bs) return as ? 1 : -1;
    return 0;
  });

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Faculty Load Summary</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {instructors.map((i) => {
            const assigned = totalFor(i.id);
            const total = assigned + i.externalLoadCount;
            const over = total > i.normalLoad;
            return (
              <div key={i.id} style={{
                border: `1px solid ${over ? "var(--rust)" : "var(--line)"}`, padding: "8px 12px",
                background: over ? "#FFE8ED" : "var(--card)", minWidth: 150,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{i.name}</div>
                <div style={{ fontSize: 11.5, color: over ? "var(--rust)" : "var(--slate)" }}>
                  {assigned} assigned{i.externalLoadCount > 0 ? ` + ${i.externalLoadCount} external` : ""} / {i.normalLoad} normal
                  {over && <span style={{ marginLeft: 6, fontWeight: 700 }}>OVER</span>}
                </div>
                {i.externalLoadNote && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{i.externalLoadNote}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {(uncoveredCodes.length > 0 || strongCodes.length > 0) && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Faculty Priority Feedback</h3>
          {uncoveredCodes.length > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--rust)", marginBottom: 6 }}>
              <b>No one has expressed interest in:</b> {uncoveredCodes.join(", ")} — worth checking with faculty directly before assigning.
            </p>
          )}
          {strongCodes.length > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--sage)" }}>
              <b>Strong interest (someone rated it top priority):</b> {strongCodes.join(", ")}
            </p>
          )}
          <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>
            Cell colors in the matrix below reflect each faculty member's own stated priority for that course:
            <span style={{ background: PRIORITY_COLORS[1], padding: "1px 6px", marginLeft: 6 }}>Top priority</span>
            <span style={{ background: PRIORITY_COLORS[2], padding: "1px 6px", marginLeft: 4 }}>Good</span>
            <span style={{ background: PRIORITY_COLORS[3], padding: "1px 6px", marginLeft: 4 }}>Neutral</span>
            — a hint only, not automatically applied.
          </p>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Section Assignment Matrix</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
              placeholder="Filter courses…" style={{ padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: 160 }}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">All types</option>
              {courseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} style={{ padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">All batches</option>
              {batchLabels.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            {courseCategories.length > 0 && (
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: "5px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                <option value="">All categories</option>
                {courseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowColumnPicker((v) => !v)} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px" }}>
                Columns ▾
              </button>
              {showColumnPicker && (
                <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--card)", border: "1px solid var(--line)", padding: 10, zIndex: 10, minWidth: 260, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Show columns</div>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}><input type="checkbox" checked={showType} onChange={(e) => setShowType(e.target.checked)} /> Type</label>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}><input type="checkbox" checked={showBatch} onChange={(e) => setShowBatch(e.target.checked)} /> Batch</label>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}><input type="checkbox" checked={showStudents} onChange={(e) => setShowStudents(e.target.checked)} /> Students</label>
                  <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}><input type="checkbox" checked={showProgress} onChange={(e) => setShowProgress(e.target.checked)} /> Assigned / Needed</label>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>Show faculty</div>
                  {specializations.length > 0 && (
                    <select
                      value={specializationFilter} onChange={(e) => setSpecializationFilter(e.target.value)}
                      style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--line)", fontSize: 11.5, marginBottom: 8 }}
                    >
                      <option value="">All specializations</option>
                      {specializations.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  {instructorCategories.length > 0 && (
                    <select
                      value={instructorCategoryFilter} onChange={(e) => setInstructorCategoryFilter(e.target.value)}
                      style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--line)", fontSize: 11.5, marginBottom: 8 }}
                    >
                      <option value="">All categories</option>
                      {instructorCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <div style={{ maxHeight: 160, overflowY: "auto" }}>
                    {instructors.map((i) => (
                      <label key={i.id} style={{ display: "block", fontSize: 12, marginBottom: 3 }}>
                        <input
                          type="checkbox" checked={!hiddenInstructorIds.has(i.id)}
                          onChange={(e) => {
                            const next = new Set(hiddenInstructorIds);
                            if (e.target.checked) next.delete(i.id); else next.add(i.id);
                            setHiddenInstructorIds(next);
                          }}
                        /> {i.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <a href="/api/assigner/matrix/export-grid" className="btn btn-export" style={{ fontSize: 12, padding: "5px 10px" }}>
              Download as Excel
            </a>
            <label className="btn btn-import" style={{ fontSize: 12, padding: "5px 10px", cursor: importing ? "wait" : "pointer" }}>
              {importing ? "Uploading…" : "Upload edited Excel"}
              <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
            </label>
          </div>
        </div>
        {importResult && (
          <div style={{ fontSize: 12, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>
            Applied: {importResult.coursesUpdated} course row(s), {importResult.groupsUpdated} combined-group row(s).
            {importResult.rowsSkipped > 0 && <> {importResult.rowsSkipped} row(s) skipped (didn't match any of your courses/groups — check for hand-edited ids).</>}
            {importResult.skippedInstructorNames?.length > 0 && <> Columns not recognized as a unique faculty name: {importResult.skippedInstructorNames.join(", ")}.</>}
          </div>
        )}

        {(() => {
          const headerCells = (
            <>
              <th className="sticky-corner">Course</th>
              {showType && <th className="sticky-row">Type</th>}
              {showBatch && <th className="sticky-row">Batch</th>}
              {showStudents && <th className="sticky-row">Students</th>}
              {showProgress && <th className="sticky-row" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "8px 4px", height: 140, width: 30, maxWidth: 30, whiteSpace: "nowrap", textAlign: "left" }}>Assigned/Needed</th>}
              {sortedInstructors.map((i, idx) => {
                const over = totalFor(i.id) + i.externalLoadCount > i.normalLoad;
                const settled = isInstructorSettled(i);
                const newBoundary = idx > 0 && isInstructorSettled(sortedInstructors[idx - 1]) !== settled;
                const avail = availabilityLevel(i, totalFor(i.id));
                const title = [i.name, i.specialization ? `Specialization: ${i.specialization}` : undefined, avail.label, settled ? "At/over normal load" : undefined].filter(Boolean).join(" · ");
                return (
                  <th key={i.id} className="sticky-row" title={title} style={{
                    textAlign: "left", color: over ? "var(--rust)" : undefined,
                    borderLeft: newBoundary ? "2px solid var(--rust)" : undefined, opacity: settled ? 0.6 : 1,
                    writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "8px 4px",
                    height: 140, width: 30, maxWidth: 30, whiteSpace: "nowrap",
                    boxShadow: `inset 3px 0 0 0 ${avail.color}`,
                  }}>
                    {i.name}{settled ? " (FULL)" : ""}
                  </th>
                );
              })}
              <th className="sticky-corner" style={{ left: "auto", right: 0 }}>Course</th>
            </>
          );

          return (
            <SortableTable paginate={false}>
              <thead><tr>{headerCells}</tr></thead>
              <tbody>
                {sortedRows.map((r, rowIdx) => {
                  const assignedTotal = Object.values(r.assignments).reduce((a, b) => a + b, 0);
                  const shortOrOver = assignedTotal !== r.sectionsNeeded;
                  const settled = isRowSettled(r);
                  const newBoundary = rowIdx > 0 && isRowSettled(sortedRows[rowIdx - 1]) !== settled;
                  const shortLabel = (r.code && shortNames[r.code]) || (r.code ? r.code.slice(0, 3) : r.label.slice(0, 3));
                  const nameCell = (
                    <td className="sticky-col" title={r.label} style={{ whiteSpace: "nowrap", maxWidth: 60 }}>
                      <b>{shortLabel}</b>
                      {r.kind === "group" && <span style={{ marginLeft: 6, fontSize: 9.5, background: "#EDF6FF", color: "var(--brass-dark)", padding: "1px 6px", borderRadius: 6, textTransform: "uppercase" }}>Combined</span>}
                      {settled && <span style={{ marginLeft: 6, fontSize: 9.5, color: "var(--sage)", fontWeight: 700 }}>SETTLED</span>}
                    </td>
                  );
                  return (
                    <tr key={r.kind + r.id} style={{ borderTop: newBoundary ? "2px solid var(--sage)" : undefined, opacity: settled ? 0.65 : 1 }}>
                      {nameCell}
                      {showType && <td style={{ fontSize: 11.5 }}>{r.courseType}</td>}
                      {showBatch && <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>{r.batchLabel}</td>}
                      {showStudents && <td style={{ fontSize: 12 }}>{r.studentCount}</td>}
                      {showProgress && (
                        <td style={{ fontSize: 12, fontWeight: 600, color: shortOrOver ? "var(--brass-dark)" : "var(--sage)" }}>
                          {assignedTotal} / {r.sectionsNeeded}
                        </td>
                      )}
                      {sortedInstructors.map((i) => {
                        const value = r.assignments[i.id] || 0;
                        const key = r.id + i.id;
                        const over = totalFor(i.id) + i.externalLoadCount > i.normalLoad;
                        const matches = specializationMatches(r, i);
                        const priority = r.code ? priorities[r.code]?.[i.id] : undefined;
                        const avail = availabilityLevel(i, totalFor(i.id));
                        const needsAllocation = !settled && value === 0;
                        const title = [
                          `${r.label} · ${i.name}`,
                          avail.label,
                          priority ? `${i.name} rated this ${PRIORITY_LABELS[priority]}` : undefined,
                          matches ? `${i.name}'s specialization matches this elective` : undefined,
                          needsAllocation ? "This course still needs allocation" : undefined,
                        ].filter(Boolean).join(" · ");
                        return (
                          <td key={i.id} title={title} style={{
                            textAlign: "center",
                            background: over && value > 0 ? "#FFE8ED" : priority ? PRIORITY_COLORS[priority] : matches ? "#E3F8EF" : undefined,
                            outline: needsAllocation ? `1px dashed ${avail.fg}` : undefined, outlineOffset: needsAllocation ? "-1px" : undefined,
                          }}>
                            <input
                              type="number" min={0} defaultValue={value} disabled={busyCell === key}
                              onBlur={(e) => { const n = parseInt(e.target.value, 10) || 0; if (n !== value) setCount(r, i.id, n); }}
                              style={{ width: 44, padding: "3px 4px", border: matches ? "1px solid var(--sage)" : "1px solid var(--line)", textAlign: "center", fontSize: 12 }}
                            />
                          </td>
                        );
                      })}
                      {nameCell}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>{headerCells}</tr></tfoot>
            </SortableTable>
          );
        })()}
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          "Combined" rows are equivalence groups. Rows/columns already fully assigned ("SETTLED"/"FULL") sink
          toward the bottom/right and are dimmed, keeping what still needs attention near the top-left. Use
          "Filter courses" plus the Type/Batch/Category dropdowns to work through one slice at a time — e.g.
          assign Core courses now, come back for IDS/Elective in a later pass. "Columns ▾" shows/hides the
          Type/Batch/Students/Progress columns, lets you hide specific faculty, and includes specialization
          and category filters to quickly narrow the faculty shown — categories are your own institution's
          labels (set under "Course & Faculty Categories"), separate from HEC's official course type. Hover any cell for course, instructor, and
          workload-availability details together. The colored bar on each instructor's name shows how much of
          their normal load is still unfilled — green has room, amber exactly full, red already over — based
          on what's assigned to them here plus their external load, not a time-slot check. A dashed outline
          marks an empty cell on a course that still needs allocating.
        </p>
      </div>
    </>
  );
}
