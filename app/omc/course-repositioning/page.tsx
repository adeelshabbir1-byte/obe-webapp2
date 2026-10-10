import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { coordinatorIdsFor, roleLabel } from "../../../lib/reportScope";
import { findOwnInstitutionCurriculum } from "../../../lib/institutionCurriculum";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import InteractiveCourseMap from "../../../components/InteractiveCourseMap";
import BatchCoursesAdminPanel from "../../../components/BatchCoursesAdminPanel";
import { courseLegendEntry } from "../../../lib/courseTypeColors";

export default async function CourseRepositioningPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  // Actually moving a course to a different semester is still OMC-only
  // (see the /reposition API route) — Coordinators, Subject Experts, and
  // the Institute Head can see the same map here, just without being able to
  // drag a course into a new row.
  if (!["OMC", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const canEdit = user.role === "OMC";
  // Adding, deleting, and quick-editing a batch's courses (below the map)
  // is OMC-or-Coordinator — same institution-wide scope the underlying
  // API routes now accept — but not Subject Expert or Institute Head, who are
  // here to view the sequencing, not change the batch's course list.
  const canManageCourses = user.role === "OMC" || user.role === "PROGRAM_COORDINATOR";

  const coordinatorIds = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const selectedBatchId = searchParams.batchId || batches[0]?.id || "";
  const curriculum = canManageCourses ? await findOwnInstitutionCurriculum(user.id) : null;

  const courses = selectedBatchId
    ? await prisma.course.findMany({
        where: { batchId: selectedBatchId },
        include: { prerequisiteCourse: true, masterCourse: { select: { category: true } } },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  // Keyed by label (not raw courseType) so an MG-coded "Elective" course
  // gets its own "University Elective" swatch instead of collapsing into
  // the same legend entry as a plain domain elective of the same type.
  const legendEntries = Array.from(
    new Map(courses.map((c) => courseLegendEntry(c.courseType, c.code)).map((entry) => [entry.label, entry])).values()
  );

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
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

      {legendEntries.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {legendEntries.map((entry) => (
              <span key={entry.label} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, background: entry.color, display: "inline-block", borderRadius: 6 }} />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <InteractiveCourseMap
        key={selectedBatchId || "none"}
        mode="reposition"
        readOnly={!canEdit}
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, courseType: c.courseType, creditHours: c.creditHours,
          semesterNumber: c.semesterNumber, prerequisiteCourseId: c.prerequisiteCourseId, isOffered: c.isOffered,
          masterCourseId: c.masterCourseId,
          trackName: c.trackName, isNonCredit: c.isNonCredit, contactHours: c.contactHours,
          // Which restricted pool to offer, if any — Elective slots pick
          // from Domain Elective, IDS-III/IV "institution-selected"
          // slots pick from the separate, smaller Domain IDS pool. The
          // two are never interchangeable: an IDS slot must never offer
          // the full elective catalog, so this is checked by course
          // type first, not just by whether a MasterCourse link exists.
          // Every Elective-type course stays clickable to re-pick, even
          // one that's already filled in — a batch inherits whatever the
          // previous batch had chosen by default, and this is how that
          // default gets changed for the new batch without starting the
          // slot over from scratch.
          slotCategory:
            c.courseType === "Elective" ? "Domain Elective"
            : c.courseType === "IDS" && c.masterCourse?.category !== "Domain IDS" && c.masterCourse?.category !== "IDS" ? "Domain IDS"
            : null,
        }))}
      />

      {canManageCourses && selectedBatchId && (
        <BatchCoursesAdminPanel
          key={`quick-edit-${selectedBatchId}`}
          batchId={selectedBatchId}
          curriculumId={curriculum?.id || null}
          initialCourses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, semesterNumber: c.semesterNumber, courseType: c.courseType }))}
        />
      )}
    </Shell>
  );
}
