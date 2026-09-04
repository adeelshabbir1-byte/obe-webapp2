"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { courseTypeColor } from "../lib/courseTypeColors";

type Course = {
  id: string; code: string; title: string; courseType: string; creditHours: number;
  semesterNumber: number | null; prerequisiteCourseId: string | null; isOffered: boolean;
};

const BOX_W = 168, BOX_H = 56, H_GAP = 24, V_GAP = 64, TOP_MARGIN = 30, LEFT_MARGIN = 150;

function contactHoursFor(c: Course) {
  return c.courseType === "Lab" ? c.creditHours * 3 : c.creditHours;
}

export default function InteractiveCourseMap({ courses: initialCourses, mode }: { courses: Course[]; mode: "prereq" | "reposition" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSemester, setPreviewSemester] = useState<number | null>(null);

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
      setLoading(false); setSelectedId(null); router.refresh();
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
      setLoading(false); setSelectedId(null); setPreviewSemester(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function onCourseClick(c: Course) {
    if (loading) return;
    if (!selectedId) { setSelectedId(c.id); return; }
    if (selectedId === c.id) { setSelectedId(null); return; }

    if (mode === "prereq") {
      setPrerequisite(c.id, selectedId); // selectedId becomes c's prerequisite
    }
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
    return { credit: all.reduce((s, c) => s + c.creditHours, 0), contact: all.reduce((s, c) => s + contactHoursFor(c), 0), count: all.length };
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          {mode === "prereq"
            ? (selectedId ? `Click the course that "${selectedCourse?.code}" should require as a prerequisite.` : "Click a course, then click the one it should require as a prerequisite. Click a linked course again to remove that link.")
            : (selectedId ? `Click a semester row to move "${selectedCourse?.code}" there.` : "Click a course, then click a semester row label to move it there.")}
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
                  <text x={10} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 + 12} fontSize={9.5} fill="var(--slate)">
                    {load.credit}cr / {load.contact}ct
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
                <g key={c.id} onClick={() => onCourseClick(c)} style={{ cursor: loading ? "wait" : "pointer" }}>
                  <rect x={pos.x} y={pos.y} width={BOX_W} height={BOX_H} rx={6} fill={courseTypeColor(c.courseType)} opacity={c.isOffered ? 0.5 : 0.9}
                    stroke={isSelected ? "#1E1B4B" : "none"} strokeWidth={isSelected ? 3 : 0} />
                  <text x={pos.x + BOX_W / 2} y={pos.y + 22} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{c.code}</text>
                  <text x={pos.x + BOX_W / 2} y={pos.y + 40} textAnchor="middle" fontSize={10} fill="#fff">
                    {c.title.length > 22 ? c.title.slice(0, 20) + "…" : c.title}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </>
  );
}
