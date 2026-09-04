import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

const BOX_W = 168, BOX_H = 56, H_GAP = 24, V_GAP = 64, TOP_MARGIN = 30, LEFT_MARGIN = 140;

export default async function PrerequisiteMapPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  const selectedBatchId = searchParams.batchId || batchesForDegree[0]?.id || "";

  const courses = selectedBatchId
    ? await prisma.course.findMany({
        where: { batchId: selectedBatchId },
        include: { prerequisiteCourse: true },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  const maxSemester = courses.length > 0 ? Math.max(...courses.map((c) => c.semesterNumber || 1)) : 0;
  const byRow: Record<number, typeof courses> = {};
  for (const c of courses) {
    const sem = c.semesterNumber || 1;
    byRow[sem] = [...(byRow[sem] || []), c];
  }
  const maxPerRow = Math.max(1, ...Object.values(byRow).map((r) => r.length));

  const positions = new Map<string, { x: number; y: number }>();
  for (let sem = 1; sem <= maxSemester; sem++) {
    const rowCourses = byRow[sem] || [];
    rowCourses.forEach((c, i) => {
      positions.set(c.id, {
        x: LEFT_MARGIN + i * (BOX_W + H_GAP),
        y: TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP),
      });
    });
  }

  const svgWidth = LEFT_MARGIN + maxPerRow * (BOX_W + H_GAP) + 40;
  const svgHeight = TOP_MARGIN + maxSemester * (BOX_H + V_GAP) + 20;

  const lines = courses
    .filter((c) => c.prerequisiteCourseId && positions.has(c.prerequisiteCourseId) && positions.has(c.id))
    .map((c) => {
      const from = positions.get(c.prerequisiteCourseId!)!;
      const to = positions.get(c.id)!;
      const x1 = from.x + BOX_W / 2, y1 = from.y + BOX_H;
      const x2 = to.x + BOX_W / 2, y2 = to.y;
      return { key: c.id, x1, y1, x2, y2 };
    });

  const usedTypes = Array.from(new Set(courses.map((c) => c.courseType)));

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Prerequisite Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        One row per semester, boxes color-coded by course type, lines connecting a course to its prerequisite.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Degree</label>
            <select name="degree" defaultValue={selectedDegree} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batchesForDegree.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Map</button>
        </form>
      </div>

      {usedTypes.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {usedTypes.map((t) => (
              <span key={t} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, background: courseTypeColor(t), display: "inline-block", borderRadius: 3 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {courses.length === 0 ? (
          <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses in this batch yet.</p>
        ) : (
          <svg width={svgWidth} height={svgHeight} style={{ display: "block", minWidth: svgWidth }}>
            {Array.from({ length: maxSemester }, (_, i) => i + 1).map((sem) => (
              <text key={sem} x={10} y={TOP_MARGIN + (sem - 1) * (BOX_H + V_GAP) + BOX_H / 2 + 4} fontSize={12} fontWeight={700} fill="var(--slate)">
                Sem {sem}
              </text>
            ))}

            {lines.map((l) => (
              <path
                key={l.key}
                d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + V_GAP / 2}, ${l.x2} ${l.y2 - V_GAP / 2}, ${l.x2} ${l.y2}`}
                fill="none" stroke="var(--brass-dark)" strokeWidth={1.5} markerEnd="url(#arrow)"
              />
            ))}

            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--brass-dark)" />
              </marker>
            </defs>

            {courses.map((c) => {
              const pos = positions.get(c.id);
              if (!pos) return null;
              return (
                <g key={c.id}>
                  <rect x={pos.x} y={pos.y} width={BOX_W} height={BOX_H} rx={6} fill={courseTypeColor(c.courseType)} opacity={0.9} />
                  <text x={pos.x + BOX_W / 2} y={pos.y + 22} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{c.code}</text>
                  <text x={pos.x + BOX_W / 2} y={pos.y + 40} textAnchor="middle" fontSize={10} fill="#fff">
                    {c.title.length > 24 ? c.title.slice(0, 22) + "…" : c.title}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </Shell>
  );
}
