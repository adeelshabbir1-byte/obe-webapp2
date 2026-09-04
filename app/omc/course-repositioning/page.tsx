import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { coordinatorIdsFor } from "../../../lib/reportScope";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import CourseRepositioningManager from "../../../components/CourseRepositioningManager";

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
        include: { prerequisiteCourse: true },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Repositioning</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Move an HEC-approved course to a different semester before it's offered. Blocked if it would land
        before its own prerequisite, or ahead of a course that depends on it.
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

      {courses.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses in this batch yet.</p></div>
      ) : (
        <CourseRepositioningManager
          courses={courses.map((c) => ({
            id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
            semesterNumber: c.semesterNumber, isOffered: c.isOffered,
            prerequisiteCode: c.prerequisiteCourse?.code || null, prerequisiteSemester: c.prerequisiteCourse?.semesterNumber || null,
          }))}
        />
      )}
    </Shell>
  );
}
