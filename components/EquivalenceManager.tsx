"use client";

import { useState, useEffect } from "react";

type Course = { id: string; code: string; title: string; studentCount: number; groupId: string | null };
type BatchColumn = { batchId: string; batchLabel: string; courses: Course[] };
type Group = { id: string; name: string };

export default function EquivalenceManager() {
  const [batches, setBatches] = useState<BatchColumn[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ batchId: string; courseId: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const maxUngrouped = Math.max(0, ...batches.map((b) => b.courses.filter((c) => !c.groupId).length));
  const totalRows = groups.length + maxUngrouped;

  function cellFor(batch: BatchColumn, rowIndex: number): Course | null {
    if (rowIndex < groups.length) {
      const g = groups[rowIndex];
      return batch.courses.find((c) => c.groupId === g.id) || null;
    }
    const ungrouped = batch.courses.filter((c) => !c.groupId);
    return ungrouped[rowIndex - groups.length] || null;
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
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              {batches.map((b) => <th key={b.batchId} style={{ minWidth: 200 }}>{b.batchLabel}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }).map((_, rowIndex) => (
              <tr key={rowIndex} style={{ borderTop: rowIndex === groups.length ? "2px solid var(--line)" : undefined }}>
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
                        background: isSelected ? "#F4EFE1" : course.groupId ? "#E4EEE8" : undefined,
                        border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{course.code}</div>
                      <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{course.title} ({course.studentCount})</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
