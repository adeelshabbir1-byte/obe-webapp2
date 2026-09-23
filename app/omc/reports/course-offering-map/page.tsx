import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { courseTypeColor } from "../../../../lib/courseTypeColors";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import CourseOfferingMap from "../../../../components/CourseOfferingMap";
import Link from "next/link";

export default async function CourseOfferingMapPage({ searchParams }: { searchParams: { degree?: string; batchId?: string; semester?: string; view?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.course-offering-map"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const bySemester = searchParams.view === "semester";

  if (bySemester) {
    // Grouped view: every degree program's offerings for one semester
    // number, shown together — Semester 1 across all programs, then
    // Semester 2, and so on — rather than one batch at a time.
    const allSemesterNumbers = Array.from(new Set(
      (await prisma.course.findMany({ where: { batchId: { in: allBatches.map((b) => b.id) } }, select: { semesterNumber: true } }))
        .map((c) => c.semesterNumber).filter((n): n is number => n !== null)
    )).sort((a, b) => a - b);
    const selectedSemester = searchParams.semester ? parseInt(searchParams.semester, 10) : allSemesterNumbers[0];

    const coursesForSemester = selectedSemester
      ? await prisma.course.findMany({
          where: { AND: [courseScopeFor(user), { batchId: { in: allBatches.map((b) => b.id) }, semesterNumber: selectedSemester }] },
          include: { instructor: true, batch: true },
          orderBy: [{ batch: { degreeProgram: "asc" } }, { code: "asc" }],
        })
      : [];
    const enrollmentCounts = await prisma.studentEnrollment.groupBy({
      by: ["courseId"], where: { courseId: { in: coursesForSemester.map((c) => c.id) } }, _count: { courseId: true },
    });
    const countByCourse = new Map(enrollmentCounts.map((e) => [e.courseId, e._count.courseId]));

    const byDegree = new Map<string, typeof coursesForSemester>();
    for (const c of coursesForSemester) {
      const key = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "Unknown Program";
      byDegree.set(key, [...(byDegree.get(key) || []), c]);
    }
    const usedTypes = Array.from(new Set(coursesForSemester.map((c) => c.courseType)));

    return (
      <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
        <ReportPrintHeader title="Course Offering Map — By Semester" />
        <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
          Every degree program's Semester {selectedSemester} offerings, shown together.
        </p>
        <div className="card no-print">
          <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            <input type="hidden" name="view" value="semester" />
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Semester</label>
              <select name="semester" defaultValue={selectedSemester} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                {allSemesterNumbers.map((n) => <option key={n} value={n}>Semester {n}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-brass">Show</button>
            <Link href="/omc/reports/course-offering-map" className="btn" style={{ textDecoration: "none", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Switch to Per-Batch View</Link>
          </form>
        </div>

        {usedTypes.length > 0 && (
          <div className="card no-print">
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

        {Array.from(byDegree.entries()).length === 0 && (
          <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses found for this semester.</p></div>
        )}
        {Array.from(byDegree.entries()).map(([label, degCourses]) => (
          <div key={label} className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>{label}</h3>
            <CourseOfferingMap
              courses={degCourses.map((c) => ({
                id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
                isOffered: c.isOffered, instructorName: c.instructor?.name || null, enrolledCount: countByCourse.get(c.id) || 0,
              }))}
            />
          </div>
        ))}
      </Shell>
    );
  }

  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  const selectedBatchId = searchParams.batchId || batchesForDegree[0]?.id || "";

  const courses = selectedBatchId
    ? await prisma.course.findMany({
        where: { AND: [courseScopeFor(user), { batchId: selectedBatchId }] },
        include: { instructor: true },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  const enrollmentCounts = await prisma.studentEnrollment.groupBy({
    by: ["courseId"], where: { courseId: { in: courses.map((c) => c.id) } }, _count: { courseId: true },
  });
  const countByCourse = new Map(enrollmentCounts.map((e) => [e.courseId, e._count.courseId]));

  const usedTypes = Array.from(new Set(courses.map((c) => c.courseType)));

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Course Offering Map" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Which courses are offered, who's teaching them, and how many students are actually enrolled.
      </p>

      <div className="card no-print">
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
          <Link href="/omc/reports/course-offering-map?view=semester" className="btn" style={{ textDecoration: "none", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Switch to By-Semester View (All Degrees)</Link>
        </form>
      </div>

      {usedTypes.length > 0 && (
        <div className="card no-print">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {usedTypes.map((t) => (
              <span key={t} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, background: courseTypeColor(t), display: "inline-block", borderRadius: 3 }} />
                {t}
              </span>
            ))}
            <span style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, background: "#8884", display: "inline-block", borderRadius: 3, border: "1px solid var(--line)" }} />
              Not Offered (faded)
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <CourseOfferingMap
          courses={courses.map((c) => ({
            id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
            isOffered: c.isOffered, instructorName: c.instructor?.name || null, enrolledCount: countByCourse.get(c.id) || 0,
          }))}
        />
      </div>
    </Shell>
  );
}
