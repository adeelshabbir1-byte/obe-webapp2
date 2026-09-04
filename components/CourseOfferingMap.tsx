import { courseTypeColor } from "../lib/courseTypeColors";

type Course = {
  id: string; code: string; title: string; courseType: string; semesterNumber: number | null;
  isOffered: boolean; instructorName: string | null; enrolledCount: number;
};

const BOX_W = 176, BOX_H = 68, H_GAP = 24, V_GAP = 40, TOP_MARGIN = 30, LEFT_MARGIN = 60;

export default function CourseOfferingMap({ courses }: { courses: Course[] }) {
  const maxSemester = courses.length > 0 ? Math.max(...courses.map((c) => c.semesterNumber || 1)) : 0;
  const byRow: Record<number, Course[]> = {};
  for (const c of courses) {
    const sem = c.semesterNumber || 1;
    byRow[sem] = [...(byRow[sem] || []), c];
  }
  const maxPerRow = Math.max(1, ...Object.values(byRow).map((r) => r.length));
  const svgWidth = LEFT_MARGIN + maxPerRow * (BOX_W + H_GAP) + 20;
  const svgHeight = TOP_MARGIN + maxSemester * (BOX_H + V_GAP) + 20;

  if (courses.length === 0) return <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses in this batch yet.</p>;

  return (
    <svg width={svgWidth} height={svgHeight} style={{ display: "block", minWidth: svgWidth }}>
      {Array.from({ length: maxSemester }, (_, i) => i + 1).map((sem) => (
        <text key={sem} x={8} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 + 4} fontSize={12} fontWeight={700} fill="var(--slate)">
          Sem {sem}
        </text>
      ))}
      {courses.map((c, idx) => {
        const sem = c.semesterNumber || 1;
        const rowCourses = byRow[sem] || [];
        const i = rowCourses.findIndex((x) => x.id === c.id);
        const x = LEFT_MARGIN + i * (BOX_W + H_GAP);
        const y = TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP);
        return (
          <g key={c.id}>
            <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={6} fill={courseTypeColor(c.courseType)} opacity={c.isOffered ? 0.95 : 0.3} />
            <text x={x + BOX_W / 2} y={y + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{c.code}</text>
            <text x={x + BOX_W / 2} y={y + 33} textAnchor="middle" fontSize={9.5} fill="#fff">
              {c.isOffered ? (c.instructorName || "Unassigned") : "Not Offered"}
            </text>
            {c.isOffered && (
              <text x={x + BOX_W / 2} y={y + 48} textAnchor="middle" fontSize={9.5} fill="#fff">
                {c.enrolledCount} student{c.enrolledCount === 1 ? "" : "s"}
              </text>
            )}
            <text x={x + BOX_W / 2} y={y + 62} textAnchor="middle" fontSize={8.5} fill="#fff" opacity={0.85}>
              {c.isOffered ? "Offered" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
