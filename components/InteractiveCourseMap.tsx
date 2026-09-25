"use client";

import { useState } from "react";
import { courseTypeColor } from "../lib/courseTypeColors";

type Course = {
  id: string; code: string; title: string; courseType: string; creditHours: number;
  semesterNumber: number | null; prerequisiteCourseId: string | null; isOffered: boolean;
  masterCourseId: string | null;
  // Which restricted pool to fetch from — "Domain Elective" or "Domain
  // IDS" — or null if this course isn't an unfilled generic slot at all.
  unfilledSlotCategory: string | null;
};

const BOX_W = 168, BOX_H = 56, H_GAP = 24, V_GAP = 64, TOP_MARGIN = 30, LEFT_MARGIN = 150;

function contactHoursFor(c: Course) {
  return c.courseType === "Lab" ? c.creditHours * 3 : c.creditHours;
}

export default function InteractiveCourseMap({ courses: initialCoursesProp, mode }: { courses: Course[]; mode: "prereq" | "reposition" }) {
  const [initialCourses, setCourses] = useState<Course[]>(initialCoursesProp);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSemester, setPreviewSemester] = useState<number | null>(null);
  const [electiveModalCourseId, setElectiveModalCourseId] = useState<string | null>(null);
  const [electiveModalCategory, setElectiveModalCategory] = useState<string>("Domain Elective");
  const [electiveOptions, setElectiveOptions] = useState<{ id: string; code: string; title: string; domain: string | null }[]>([]);
  const [electiveSearch, setElectiveSearch] = useState("");
  const [loadingElectives, setLoadingElectives] = useState(false);

  const maxSemester = initialCourses.length > 0 ? Math.max(8, ...initialCourses.map((c) => c.semesterNumber || 1)) : 8;
  const byRow: Record<number, Course[]> = {};
  for (const c of initialCourses) {
    const sem = c.semesterNumber || 1;
    byRow[sem] = [...(byRow[sem] || []), c];
  }
  const maxPerRow = Math.max(1, ...Object.values(byRow).map((r) => r.length));

  const positions = new Map<string, { x: number; y: number }>();
  for (let sem = 1; sem <= maxSemester; sem++) {
    (byRow[sem] || []).forEach((c, i) => positions.set(c.id, { x: LEFT_MARGIN + i * (BOX_W + H_GAP), y: TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) }));
  }
  const svgWidth = LEFT_MARGIN + maxPerRow * (BOX_W + H_GAP) + 40;
  const svgHeight = TOP_MARGIN + maxSemester * (BOX_H + V_GAP) + 20;

  const lines = initialCourses
    .filter((c) => c.prerequisiteCourseId && positions.has(c.prerequisiteCourseId) && positions.has(c.id))
    .map((c) => {
      const from = positions.get(c.prerequisiteCourseId!)!, to = positions.get(c.id)!;
      return { key: c.id, x1: from.x + BOX_W / 2, y1: from.y + BOX_H, x2: to.x + BOX_W / 2, y2: to.y };
    });

  async function setPrerequisite(courseId: string, prerequisiteCourseId: string | null) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/prerequisite`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prerequisiteCourseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, prerequisiteCourseId } : c));
      setLoading(false); setSelectedId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function moveToSemester(courseId: string, semesterNumber: number) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/omc/courses/${courseId}/reposition`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterNumber }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, semesterNumber: data.course.semesterNumber } : c));
      setLoading(false); setSelectedId(null); setPreviewSemester(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function onCourseClick(c: Course) {
    if (loading) return;
    // Being offered for the current term doesn't block choosing which
    // elective this slot actually is -- that's a separate decision from
    // whether the semester's courses have been activated, and the two
    // shouldn't be strictly ordered. The backend still blocks this once
    // a student is actually enrolled, which is the real point past which
    // changing the course's identity would be disruptive. This applies
    // in either mode -- an unfilled elective is just as much a generic
    // placeholder on the Prerequisite Map as it is on the Repositioning
    // page, and picking which real course it is doesn't conflict with
    // prerequisite-linking (a different, non-overlapping click target).
    // unfilledSlotCategory (computed server-side from the course's own
    // type and its linked MasterCourse's category, not just whether
    // masterCourseId is set) is what actually distinguishes a
    // still-generic "Elective-I" or "IDS-III (institution-selected)"
    // slot from an already-filled one -- importing a curriculum links
    // masterCourseId for every course including these generic
    // placeholders, so masterCourseId alone can't tell them apart. It
    // also picks which restricted pool the modal should offer -- an
    // IDS slot must never be filled from the full elective catalog.
    if (c.unfilledSlotCategory) {
      openElectiveModal(c.id, c.unfilledSlotCategory);
      return;
    }
    if (!selectedId) { setSelectedId(c.id); return; }
    if (selectedId === c.id) { setSelectedId(null); return; }

    if (mode === "prereq") {
      setPrerequisite(c.id, selectedId); // selectedId becomes c's prerequisite
    }
  }

  function openElectiveModal(courseId: string, category: string) {
    setElectiveModalCourseId(courseId);
    setElectiveModalCategory(category);
    setElectiveSearch("");
    setLoadingElectives(true);
    fetch(`/api/omc/curriculum-electives?category=${encodeURIComponent(category)}`).then((r) => r.json()).then((data) => {
      setElectiveOptions(data.courses || []);
      setLoadingElectives(false);
    });
  }

  async function fillElective(masterCourseId: string) {
    if (!electiveModalCourseId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/omc/courses/${electiveModalCourseId}/fill-elective`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterCourseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.map((c) => c.id === electiveModalCourseId ? { ...c, ...data.course } : c));
      setElectiveModalCourseId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function onRowClick(semesterNumber: number) {
    if (mode !== "reposition" || !selectedId || loading) return;
    const course = initialCourses.find((c) => c.id === selectedId);
    if (course?.isOffered) { setError("That course is already offered — can't be repositioned."); return; }
    moveToSemester(selectedId, semesterNumber);
  }

  const selectedCourse = initialCourses.find((c) => c.id === selectedId);

  // Live load preview for reposition mode: hover/select shows both source and target row totals.
  function rowLoad(semesterNumber: number, excludeId?: string, includeCourse?: Course) {
    const rowCourses = (byRow[semesterNumber] || []).filter((c) => c.id !== excludeId);
    const all = includeCourse ? [...rowCourses, includeCourse] : rowCourses;
    const labCourses = all.filter((c) => c.courseType === "Lab");
    return {
      credit: all.reduce((s, c) => s + c.creditHours, 0),
      labCredit: labCourses.reduce((s, c) => s + c.creditHours, 0),
      contact: all.reduce((s, c) => s + contactHoursFor(c), 0),
      count: all.length,
    };
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          {mode === "prereq"
            ? (selectedId ? `Click the course that "${selectedCourse?.code}" should require as a prerequisite.` : "Click a course, then click the one it should require as a prerequisite. A course with a prerequisite shows a small × in its corner — click that to remove the link.")
            : (selectedId ? `Click a semester row to move "${selectedCourse?.code}" there.` : "Click a course, then click a semester row label to move it there. Click an unfilled elective or IDS slot to choose a real course for it from your curriculum.")}
        </p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {initialCourses.length === 0 ? (
          <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses in this batch yet.</p>
        ) : (
          <svg width={svgWidth} height={svgHeight} style={{ display: "block", minWidth: svgWidth }}>
            {Array.from({ length: maxSemester }, (_, i) => i + 1).map((sem) => {
              const load = mode === "reposition" && selectedId
                ? rowLoad(sem, undefined, sem === selectedCourse?.semesterNumber ? undefined : selectedCourse)
                : rowLoad(sem);
              return (
                <g key={sem}>
                  <text
                    x={10} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 - 4} fontSize={12} fontWeight={700} fill="var(--slate)"
                    style={{ cursor: mode === "reposition" && selectedId ? "pointer" : "default" }}
                    onClick={() => onRowClick(sem)}
                  >
                    Sem {sem}
                  </text>
                  <text x={10} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 + 12} fontSize={9} fill="var(--slate)">
                    Total: {load.credit}cr / {load.contact}ct
                  </text>
                  <text x={10} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 + 24} fontSize={9} fill="var(--slate)">
                    Lab: {load.labCredit}cr
                  </text>
                </g>
              );
            })}

            {lines.map((l) => (
              <path key={l.key} d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + V_GAP / 2}, ${l.x2} ${l.y2 - V_GAP / 2}, ${l.x2} ${l.y2}`} fill="none" stroke="var(--brass-dark)" strokeWidth={1.5} markerEnd="url(#arrow)" />
            ))}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--brass-dark)" />
              </marker>
            </defs>

            {initialCourses.map((c) => {
              const pos = positions.get(c.id);
              if (!pos) return null;
              const isSelected = selectedId === c.id;
              return (
                <g key={c.id} style={{ cursor: loading ? "wait" : "pointer" }}>
                  <rect x={pos.x} y={pos.y} width={BOX_W} height={BOX_H} rx={6} fill={courseTypeColor(c.courseType)} opacity={c.isOffered ? 0.5 : 0.9}
                    stroke={isSelected ? "#241A1D" : "none"} strokeWidth={isSelected ? 3 : 0} onClick={() => onCourseClick(c)} />
                  <text x={pos.x + BOX_W / 2} y={pos.y + 22} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" onClick={() => onCourseClick(c)}>{c.code}</text>
                  {mode === "prereq" && c.prerequisiteCourseId && (
                    <g onClick={(e) => { e.stopPropagation(); setPrerequisite(c.id, null); }} style={{ cursor: "pointer" }}>
                      <circle cx={pos.x + BOX_W - 10} cy={pos.y + 10} r={8} fill="#C0312B" />
                      <text x={pos.x + BOX_W - 10} y={pos.y + 14} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">×</text>
                    </g>
                  )}
                  <text x={pos.x + BOX_W / 2} y={pos.y + 40} textAnchor="middle" fontSize={10} fill="#fff" onClick={() => onCourseClick(c)}>
                    {c.title.length > 22 ? c.title.slice(0, 20) + "…" : c.title}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {electiveModalCourseId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setElectiveModalCourseId(null)}>
          <div style={{ background: "#fff", padding: 20, width: 480, maxHeight: "70vh", overflowY: "auto", border: "1px solid var(--line)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>Choose a course for this {electiveModalCategory === "Domain IDS" ? "IDS" : "elective"} slot</h3>
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
              {electiveModalCategory === "Domain IDS"
                ? "From your institution's restricted IDS list — this will rename the course and seed its CLOs."
                : "From your institution's own curriculum — this will rename the course and seed its CLOs."}
            </p>
            <input placeholder="Search…" value={electiveSearch} onChange={(e) => setElectiveSearch(e.target.value)} style={{ width: "100%", padding: 6, fontSize: 12.5, marginBottom: 10, border: "1px solid var(--line)" }} />
            {loadingElectives && <p style={{ fontSize: 12, color: "var(--slate)" }}>Loading…</p>}
            {!loadingElectives && electiveOptions
              .filter((o) => !electiveSearch || o.title.toLowerCase().includes(electiveSearch.toLowerCase()))
              .map((o) => (
                <button key={o.id} onClick={() => fillElective(o.id)} disabled={loading} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "1px solid var(--line)", background: "#fff", marginBottom: 4, fontSize: 12, cursor: "pointer" }}>
                  {o.title} {o.domain && <span style={{ color: "var(--slate)", fontSize: 10.5 }}>({o.domain})</span>}
                </button>
              ))}
            {!loadingElectives && electiveOptions.length === 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>{electiveModalCategory === "Domain IDS" ? "No IDS options found in your institution's curriculum." : "No electives found in your institution's curriculum."}</p>}
            <button onClick={() => setElectiveModalCourseId(null)} style={{ marginTop: 10, fontSize: 11.5, background: "none", border: "1px solid var(--line)", padding: "4px 10px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
