import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { courseTypeColor } from "../../../../lib/courseTypeColors";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import CourseOfferingMap from "../../../../components/CourseOfferingMap";

export default async function CourseOfferingMapPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
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
