"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Row = { kind: "course" | "group"; id: string; code: string | null; label: string; title: string; courseType: string; batchLabel: string; studentCount: number; sectionsNeeded: number; assignments: Record<string, number> };
type Instructor = { id: string; name: string; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null; specialization: string | null; dominantType: string | null };

const PRIORITY_COLORS: Record<number, string> = { 1: "#C8E6C9", 2: "#FFF9C4", 3: "#FFE0B2" };
const PRIORITY_LABELS: Record<number, string> = { 1: "Top priority", 2: "Good", 3: "Neutral/50-50" };

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
  const [uncoveredCodes, setUncoveredCodes] = useState<string[]>([]);
  const [strongCodes, setStrongCodes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyCell, setBusyCell] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/assigner/matrix");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setRows(data.rows); setInstructors(data.instructors);
      setPriorities(data.priorities || {}); setUncoveredCodes(data.uncoveredCodes || []); setStrongCodes(data.strongCodes || []);
      setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

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
                background: over ? "#FFE4DC" : "var(--card)", minWidth: 150,
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
            — a hint only, not automatically applied. Instructors and courses are also ordered to bring
            high-affinity pairs closer together, based on both history and stated priority.
          </p>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Section Assignment Matrix</h3>
        <SortableTable>
          <thead>
            <tr>
              <th className="sticky-corner">Course</th>
              <th className="sticky-row">Type</th>
              <th className="sticky-row">Batch</th>
              <th className="sticky-row">Students</th>
              <th className="sticky-row">Sections Needed</th>
              {instructors.map((i, idx) => {
                const over = totalFor(i.id) + i.externalLoadCount > i.normalLoad;
                const newCluster = idx === 0 || instructors[idx - 1].dominantType !== i.dominantType;
                return (
                  <th key={i.id} className="sticky-row" style={{ textAlign: "center", color: over ? "var(--rust)" : undefined, whiteSpace: "nowrap", borderLeft: newCluster && idx > 0 ? "2px solid var(--brass)" : undefined }}>
                    {i.name}
                    {i.specialization && <div style={{ fontSize: 9, fontWeight: 400, color: "var(--slate)" }}>{i.specialization}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIdx) => {
              const assignedTotal = Object.values(r.assignments).reduce((a, b) => a + b, 0);
              const shortOrOver = assignedTotal !== r.sectionsNeeded;
              const newBlock = rowIdx === 0 || rows[rowIdx - 1].courseType !== r.courseType;
              return (
                <tr key={r.kind + r.id} style={{ borderTop: newBlock && rowIdx > 0 ? "2px solid var(--brass)" : undefined }}>
                  <td className="sticky-col" style={{ whiteSpace: "nowrap" }}>
                    <b>{r.label}</b>
                    {r.kind === "group" && <span style={{ marginLeft: 6, fontSize: 9.5, background: "#E8E6FB", color: "var(--brass-dark)", padding: "1px 6px", borderRadius: 2, textTransform: "uppercase" }}>Combined</span>}
                  </td>
                  <td style={{ fontSize: 11.5 }}>{r.courseType}</td>
                  <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>{r.batchLabel}</td>
                  <td style={{ fontSize: 12 }}>{r.studentCount}</td>
                  <td style={{ fontSize: 12, fontWeight: 600, color: shortOrOver ? "var(--brass-dark)" : "var(--sage)" }}>
                    {assignedTotal} / {r.sectionsNeeded}
                  </td>
                  {instructors.map((i, idx) => {
                    const value = r.assignments[i.id] || 0;
                    const key = r.id + i.id;
                    const over = totalFor(i.id) + i.externalLoadCount > i.normalLoad;
                    const matches = specializationMatches(r, i);
                    const priority = r.code ? priorities[r.code]?.[i.id] : undefined;
                    const newCluster = idx === 0 || instructors[idx - 1].dominantType !== i.dominantType;
                    const title = [
                      priority ? `${i.name} rated this ${PRIORITY_LABELS[priority]}` : undefined,
                      matches ? `${i.name}'s specialization matches this elective` : undefined,
                    ].filter(Boolean).join(" · ") || undefined;
                    return (
                      <td key={i.id} title={title} style={{
                        textAlign: "center",
                        background: over && value > 0 ? "#FFE4DC" : priority ? PRIORITY_COLORS[priority] : matches ? "#CCFBF1" : undefined,
                        borderLeft: newCluster && idx > 0 ? "2px solid var(--brass)" : undefined,
                      }}>
                        <input
                          type="number" min={0} defaultValue={value} disabled={busyCell === key}
                          onBlur={(e) => { const n = parseInt(e.target.value, 10) || 0; if (n !== value) setCount(r, i.id, n); }}
                          style={{ width: 44, padding: "3px 4px", border: matches ? "1px solid var(--sage)" : "1px solid var(--line)", textAlign: "center", fontSize: 12 }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          "Combined" rows are equivalence groups (courses from different batches/programs taught together).
          Sections Needed is calculated automatically at 1 section per 50 students. Going over a faculty
          member's normal load is allowed but highlighted in red as a warning. Courses are grouped by type;
          instructors are ordered by the type of course they've historically taught most (a thicker line marks
          each new group), and a cell is highlighted green when an instructor's specialization matches an
          elective's title.
        </p>
      </div>
    </>
  );
}
