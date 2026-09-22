"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Course = { id: string; code: string; title: string; studentCount: number; groupId: string | null; offeredTermName: string | null; offeredTermYear: number | null };
type BatchColumn = { batchId: string; batchLabel: string; courses: Course[] };
type Group = { id: string; name: string; createdByName?: string | null; masterCourse: { id: string; code: string; title: string } | null };
type MasterCourseOption = { id: string; code: string; title: string; degreeProgram: string; hasPloSuggestions: boolean };

export default function EquivalenceManager() {
  const [batches, setBatches] = useState<BatchColumn[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ batchId: string; courseId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [masterOptions, setMasterOptions] = useState<MasterCourseOption[]>([]);
  const [pickerOpenForGroup, setPickerOpenForGroup] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(false);

  useEffect(() => {
    fetch("/api/omc/equivalence/master-course-options").then((r) => r.json()).then((d) => { if (d.options) setMasterOptions(d.options); });
  }, []);

  async function setGroupMasterCourse(groupId: string, masterCourseId: string | null) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/omc/equivalence/set-master-course", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, masterCourseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setPickerOpenForGroup(null); setPickerSearch(""); setBusy(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function load() {
    try {
      const res = await fetch("/api/omc/equivalence");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setBatches(data.batches); setGroups(data.groups); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleClick(batchId: string, courseId: string) {
    if (!selected) { setSelected({ batchId, courseId }); return; }
    if (selected.courseId === courseId) { setSelected(null); return; } // clicked same course again — deselect
    if (selected.batchId === batchId) {
      // Same column — just move selection, don't pair with itself-column
      setSelected({ batchId, courseId });
      return;
    }
    // Different column — pair them
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/omc/equivalence/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIdA: selected.courseId, courseIdB: courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); setSelected(null); return; }
      setSelected(null); setBusy(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); setSelected(null); }
  }

  async function handleDoubleClick(courseId: string, groupId: string | null) {
    if (!groupId) return; // not grouped, nothing to remove
    setBusy(true); setError("");
    try {
      await fetch(`/api/omc/equivalence/${groupId}/members/${courseId}`, { method: "DELETE" });
      setBusy(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;
  if (batches.length === 0) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No batches with offered courses yet.</p></div>;

  // Row layout: grouped rows first (aligned by group order), then each
  // column's remaining ungrouped courses stacked independently below.
  const visibleGroups = showOnlyUnlinked ? groups.filter((g) => !g.masterCourse) : groups;
  const maxUngrouped = Math.max(0, ...batches.map((b) => b.courses.filter((c) => !c.groupId).length));
  // Ungrouped rows have no group to link to a HEC course at all, so
  // they're excluded when filtering to "not yet linked", same as
  // Content Sync's version of this filter.
  const totalRows = showOnlyUnlinked ? visibleGroups.length : visibleGroups.length + maxUngrouped;

  function cellFor(batch: BatchColumn, rowIndex: number): Course | null {
    if (rowIndex < visibleGroups.length) {
      const g = visibleGroups[rowIndex];
      return batch.courses.find((c) => c.groupId === g.id) || null;
    }
    if (showOnlyUnlinked) return null;
    const ungrouped = batch.courses.filter((c) => !c.groupId);
    return ungrouped[rowIndex - visibleGroups.length] || null;
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 4 }}>
          Click a course, then click another in a <b>different</b> column to mark them equivalent — they'll snap
          into the same row. Double-click a course that's already paired to remove it from its group (it drops
          back to the bottom of its own column).
        </p>
        {selected && <p style={{ fontSize: 12, color: "var(--brass-dark)" }}>Selected — click a course in another column to pair.</p>}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6 }}>
          <input type="checkbox" checked={showOnlyUnlinked} onChange={(e) => setShowOnlyUnlinked(e.target.checked)} />
          Show only groups not yet linked to a HEC course
        </label>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>
          The <b>HEC Course</b> column links a group to its matching HEC/standard-curriculum course — once set,
          HEC's suggested PLO mapping becomes available on the PLO-Course Matrix page for that course in every
          batch it's linked to ("Auto-map HEC" there applies it, one batch at a time).
        </p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>Group</th>
              <th style={{ minWidth: 220 }}>HEC Course</th>
              {batches.map((b) => <th key={b.batchId} style={{ minWidth: 200 }}>{b.batchLabel}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }).map((_, rowIndex) => (
              <tr key={rowIndex} style={{ borderTop: rowIndex === visibleGroups.length ? "2px solid var(--line)" : undefined }}>
                <td style={{ fontSize: 11, color: "var(--slate)" }}>
                  {rowIndex < visibleGroups.length && (
                    <>
                      {visibleGroups[rowIndex].name}
                      {visibleGroups[rowIndex].createdByName && <div style={{ fontSize: 9.5 }}>by {visibleGroups[rowIndex].createdByName}</div>}
                    </>
                  )}
                </td>
                <td style={{ background: rowIndex < visibleGroups.length && !visibleGroups[rowIndex].masterCourse ? "#FEE2E2" : undefined }}>
                  {rowIndex < visibleGroups.length && (() => {
                    const group = visibleGroups[rowIndex];
                    const isOpen = pickerOpenForGroup === group.id;
                    if (!isOpen) {
                      return (
                        <div onClick={() => setPickerOpenForGroup(group.id)} style={{ cursor: "pointer", fontSize: 11.5 }}>
                          {group.masterCourse ? (
                            <>
                              <div style={{ fontWeight: 600 }}>{group.masterCourse.code}</div>
                              <div style={{ color: "var(--slate)" }}>{group.masterCourse.title}</div>
                            </>
                          ) : (
                            <span style={{ color: "var(--rust)", fontWeight: 600 }}>Not linked — click to set</span>
                          )}
                        </div>
                      );
                    }
                    const filtered = masterOptions.filter((o) =>
                      !pickerSearch || o.code.toLowerCase().includes(pickerSearch.toLowerCase()) || o.title.toLowerCase().includes(pickerSearch.toLowerCase())
                    ).slice(0, 30);
                    return (
                      <div style={{ background: "#F8EEF0", border: "1px solid var(--brass)", padding: 6, minWidth: 260 }}>
                        <input
                          autoFocus value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                          placeholder="Search HEC course code or title…"
                          style={{ width: "100%", fontSize: 11, padding: 3, border: "1px solid var(--line)", marginBottom: 4 }}
                        />
                        <div style={{ maxHeight: 180, overflowY: "auto" }}>
                          {group.masterCourse && (
                            <div onClick={() => setGroupMasterCourse(group.id, null)} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", color: "var(--rust)" }}>
                              ✕ Clear link
                            </div>
                          )}
                          {filtered.map((o) => (
                            <div key={o.id} onClick={() => setGroupMasterCourse(group.id, o.id)} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", borderBottom: "1px solid var(--line)" }}>
                              <b>{o.code}</b> — {o.title}
                              {o.hasPloSuggestions && <span style={{ fontSize: 9, background: "#FBEED2", padding: "0 4px", marginLeft: 4 }}>HEC PLOs</span>}
                              <div style={{ fontSize: 9.5, color: "var(--slate)" }}>{o.degreeProgram}</div>
                            </div>
                          ))}
                          {filtered.length === 0 && <div style={{ fontSize: 11, color: "var(--slate)", padding: 4 }}>No matches.</div>}
                        </div>
                        <button onClick={() => { setPickerOpenForGroup(null); setPickerSearch(""); }} style={{ fontSize: 10.5, padding: "2px 6px", marginTop: 4, border: "1px solid var(--line)", background: "#fff" }}>
                          Cancel
                        </button>
                      </div>
                    );
                  })()}
                </td>
                {batches.map((b) => {
                  const course = cellFor(b, rowIndex);
                  if (!course) return <td key={b.batchId}></td>;
                  const isSelected = selected?.courseId === course.id;
                  return (
                    <td key={b.batchId}
                      onClick={() => !busy && handleClick(b.batchId, course.id)}
                      onDoubleClick={() => !busy && handleDoubleClick(course.id, course.groupId)}
                      style={{
                        cursor: "pointer", padding: "6px 8px",
                        background: isSelected ? "#F3E4E7" : course.groupId ? "#E2F4E8" : undefined,
                        border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{course.code}</div>
                      <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{course.title} ({course.studentCount})</div>
                      <div style={{ fontSize: 9.5, color: "var(--brass-dark)", fontWeight: 600 }}>{course.offeredTermName ? `${course.offeredTermName} ${course.offeredTermYear}` : "Term not set"}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </>
  );
}
