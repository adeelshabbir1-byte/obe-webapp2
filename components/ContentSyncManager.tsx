"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Course = { id: string; code: string; title: string; groupId: string | null };
type BatchColumn = { batchId: string; batchLabel: string; courses: Course[] };
type Group = { id: string; name: string; createdByName?: string | null };

export default function ContentSyncManager() {
  const [batches, setBatches] = useState<BatchColumn[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<{ batchId: string; courseId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/omc/content-sync");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setBatches(data.batches); setGroups(data.groups); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function handleClick(batchId: string, courseId: string) {
    if (!selected) { setSelected({ batchId, courseId }); return; }
    if (selected.courseId === courseId) { setSelected(null); return; }
    if (selected.batchId === batchId) { setSelected({ batchId, courseId }); return; }

    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIdA: selected.courseId, courseIdB: courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); setSelected(null); return; }
      const parts = [`Linked — content will sync between them from now on.`];
      if (data.synced?.length > 0) parts.push(`Content copied to ${data.synced.length} course(s) right away.`);
      if (data.skippedGraded?.length > 0) parts.push(`${data.skippedGraded.length} course(s) skipped — they already have entered grades.`);
      if (data.alsoMadeEquivalent) parts.push(`They're offered in the same term, so they were also combined as one class in Course Equivalence.`);
      setNotice(parts.join(" "));
      setSelected(null); setBusy(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); setSelected(null); }
  }

  async function handleDoubleClick(courseId: string, groupId: string | null) {
    if (!groupId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await fetch(`/api/omc/content-sync/${groupId}/members/${courseId}`, { method: "DELETE" });
      setBusy(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;
  if (batches.length === 0) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No batches with offered courses yet.</p></div>;

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
      {notice && <div style={{ fontSize: 12.5, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>{notice}</div>}
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 4 }}>
          Click a course, then click another in a <b>different</b> column to link them for content sync — from then
          on, whenever a Subject Expert saves a change to CLOs, PLO mappings, the lecture plan, or assessment
          instruments on one, the same change replaces the other's content automatically. This does NOT combine
          their sections/teaching (see Course Equivalence for that) — unless they're offered in the same term, in
          which case they're also combined as one class automatically. Double-click a linked course to unlink it.
        </p>
        {selected && <p style={{ fontSize: 12, color: "var(--brass-dark)" }}>Selected — click a course in another column to link.</p>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>Group</th>
              {batches.map((b) => <th key={b.batchId} style={{ minWidth: 200 }}>{b.batchLabel}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }).map((_, rowIndex) => (
              <tr key={rowIndex} style={{ borderTop: rowIndex === groups.length ? "2px solid var(--line)" : undefined }}>
                <td style={{ fontSize: 11, color: "var(--slate)" }}>
                  {rowIndex < groups.length && (
                    <>
                      {groups[rowIndex].name}
                      {groups[rowIndex].createdByName && <div style={{ fontSize: 9.5 }}>by {groups[rowIndex].createdByName}</div>}
                    </>
                  )}
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
                        background: isSelected ? "#E8E6FB" : course.groupId ? "#FEF3C7" : undefined,
                        border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{course.code}</div>
                      <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{course.title}</div>
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
