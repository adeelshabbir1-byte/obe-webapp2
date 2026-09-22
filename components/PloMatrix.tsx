"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { courseTypeColor } from "../lib/courseTypeColors";

type Plo = { id: string; number: number; title: string; status: string };
type Course = { id: string; code: string; title: string; courseType: string; semesterNumber: number | null; mappedPloIds: string[]; assignedByPloId?: Record<string, string | null>; hecSuggestedPloNumbers?: number[] };
type Program = { coordinatorId: string; coordinatorName: string; plos: Plo[]; courses: Course[] };

type SortKey = "code" | "type" | "semester";

function sortCourses(courses: Course[], key: SortKey): Course[] {
  const copy = [...courses];
  copy.sort((a, b) => {
    if (key === "code") return a.code.localeCompare(b.code);
    if (key === "type") return a.courseType.localeCompare(b.courseType) || a.code.localeCompare(b.code);
    // semester: nulls last
    const as = a.semesterNumber ?? 99, bs = b.semesterNumber ?? 99;
    return as - bs || a.code.localeCompare(b.code);
  });
  return copy;
}

export default function PloMatrix({ programs: initialPrograms }: { programs: Program[] }) {
  const [programs, setPrograms] = useState<Program[]>(initialPrograms);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("semester");

  async function toggle(courseId: string, ploId: string, mapped: boolean) {
    const key = courseId + ploId;
    setBusyKey(key);
    const res = await fetch("/api/omc/plo-matrix/toggle", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, ploId, mapped }),
    });
    if (res.ok) {
      setPrograms((prev) => prev.map((prog) => ({
        ...prog,
        courses: prog.courses.map((c) => c.id !== courseId ? c : {
          ...c, mappedPloIds: mapped ? [...c.mappedPloIds, ploId] : c.mappedPloIds.filter((id) => id !== ploId),
        }),
      })));
    }
    setBusyKey(null);
  }

  if (programs.length === 0) {
    return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs/courses to map yet.</p></div>;
  }

  return (
    <>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Sort courses by</label>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          <option value="semester">Semester</option>
          <option value="type">Course Type</option>
          <option value="code">Code (A–Z)</option>
        </select>
      </div>

      {programs.map((prog) => {
        const sortedCourses = sortCourses(prog.courses, sortKey);
        return (
          <div className="card" key={prog.coordinatorId} style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>{prog.coordinatorName}'s Program</h3>
            {prog.plos.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>No PLOs defined for this program yet.</p>
            ) : prog.courses.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>No courses in this program yet.</p>
            ) : (
              <SortableTable style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Course</th><th>Type</th><th>Sem</th>
                    {prog.plos.map((p) => (
                      <th key={p.id} style={{ textAlign: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", height: 90, whiteSpace: "nowrap" }}>
                        PLO-{p.number}{p.status !== "approved" ? " *" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCourses.map((c) => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b><br /><span style={{ color: "var(--slate)", fontSize: 11 }}>{c.title}</span></td>
                      <td style={{ fontSize: 11.5 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 1, background: courseTypeColor(c.courseType), display: "inline-block" }} />
                          {c.courseType}
                        </span>
                      </td>
                      <td style={{ fontSize: 11.5 }}>{c.semesterNumber ?? "—"}</td>
                      {prog.plos.map((p) => {
                        const checked = c.mappedPloIds.includes(p.id);
                        const key = c.id + p.id;
                        const assignedBy = c.assignedByPloId?.[p.id];
                        const hecSuggests = !checked && (c.hecSuggestedPloNumbers || []).includes(p.number);
                        return (
                          <td
                            key={p.id}
                            style={{ textAlign: "center", background: hecSuggests ? "#FFF9C4" : undefined }}
                            title={checked && assignedBy ? `Assigned by ${assignedBy}` : hecSuggests ? "HEC suggests this mapping — not yet set" : undefined}
                          >
                            <input
                              type="checkbox" checked={checked} disabled={busyKey === key}
                              onChange={(e) => toggle(c.id, p.id, e.target.checked)}
                            />
                            {hecSuggests && <div style={{ fontSize: 8, color: "#8A6D00" }}>HEC</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </SortableTable>
            )}
            {prog.plos.some((p) => p.status !== "approved") && (
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>* PLO not yet approved by Chairman</div>
            )}
          </div>
        );
      })}
    </>
  );
}
