import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { coordinatorIdsFor } from "../../../lib/reportScope";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import InteractiveCourseMap from "../../../components/InteractiveCourseMap";
import { courseTypeColor } from "../../../lib/courseTypeColors";

export default async function CourseRepositioningPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const selectedBatchId = searchParams.batchId || batches[0]?.id || "";

  const courses = selectedBatchId
    ? await prisma.course.findMany({
        where: { batchId: selectedBatchId },
        include: { prerequisiteCourse: true, masterCourse: { select: { category: true } } },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  const usedTypes = Array.from(new Set(courses.map((c) => c.courseType)));

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Repositioning</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Move an HEC-approved course to a different semester before it's offered — click a course, then a
        semester row. Blocked if it would land before its own prerequisite, or ahead of a course that depends
        on it, or once the course is already offered. Semester load (credit / contact hours) updates live.
        Clicking an unfilled Elective slot instead opens a picker to choose which course it actually is —
        that's a separate decision from whether the semester's courses are offered, so it stays available
        until a student is actually enrolled in it.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Load</button>
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

      <InteractiveCourseMap
        key={selectedBatchId || "none"}
        mode="reposition"
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, courseType: c.courseType, creditHours: c.creditHours,
          semesterNumber: c.semesterNumber, prerequisiteCourseId: c.prerequisiteCourseId, isOffered: c.isOffered,
          masterCourseId: c.masterCourseId,
          isUnfilledElectiveSlot: c.courseType === "Elective" && c.masterCourse?.category !== "Domain Elective",
        }))}
      />
    </Shell>
  );
}
