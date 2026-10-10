import { redirect } from "next/navigation";
import { subjectExpertWhere } from "../../../lib/dualRoles";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { homeExpertsFor } from "../../../lib/homeExperts";
import CoursesManager from "../../../components/CoursesManager";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { curriculaVisibleTo, degreeSortKey } from "../../../lib/curriculumAccess";
import { navForRole } from "../../../components/reportNav";


export default async function CoordinatorCoursesPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const selectedBatchId = searchParams.batchId || "";

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id, ...(selectedBatchId ? { batchId: selectedBatchId } : {}) },
    orderBy: [{ semesterNumber: "asc" }, { createdAt: "desc" }],
    include: { batch: true, contentSyncMember: { select: { isBase: true } }, _count: { select: { studentEnrollments: true } } },
  });

  const subjectExperts = await prisma.user.findMany({
    where: subjectExpertWhere(user.id, user.managedById || ""),
    orderBy: { name: "asc" },
  });

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  // Every curriculum this institute may import from: its own copies, plus any assigned official one it has no copy of yet.
  // Sorted by degree (all BSCS together, then BBA, ...), with the authority + version shown to tell them apart.
  const owningChairmanId = await findOwningChairmanId(user.id);
  const departmentList = await prisma.department.findMany({ where: { chairmanId: owningChairmanId || "none" }, orderBy: { name: "asc" } });
  const visible = owningChairmanId
    ? await prisma.masterCurriculum.findMany({ where: { status: "PUBLISHED", ...curriculaVisibleTo(owningChairmanId) } })
    : [];
  const copiedFrom = new Set(visible.filter((c) => c.chairmanId && c.parentCurriculumId).map((c) => c.parentCurriculumId));
  const curricula = visible
    .filter((c) => c.chairmanId || !copiedFrom.has(c.id))
    .sort((a, b) => degreeSortKey(a).localeCompare(degreeSortKey(b)) || a.authority.localeCompare(b.authority) || b.version.localeCompare(a.version));

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses</h1>
        <a href="/api/coordinator/courses/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Import from any published curriculum into a specific batch, or add courses manually. Everything stays editable afterward.
      </p>
      {selectedBatchId && courses.length > 50 && (
        <div className="card" style={{ borderColor: "var(--rust)", background: "#FFF5F0" }}>
          <p style={{ fontSize: 12.5, color: "var(--rust)" }}>
            This batch has {courses.length} courses — unusually high for a typical program. This can happen if
            "Copy From Another Batch" or an import was run more than once. Check for duplicate course codes
            before proceeding.
          </p>
        </div>
      )}
      <CoursesManager
        key={selectedBatchId || "all"}
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
          semesterNumber: c.semesterNumber, fromHec: !!c.masterCourseId, subjectExpertId: c.subjectExpertId,
          fromBenchmark: !!c.benchmarkSourceId, trackName: c.trackName, isNonCredit: c.isNonCredit, contactHours: c.contactHours, enrolledCount: c._count.studentEnrollments,
          prerequisiteCourseId: c.prerequisiteCourseId, batchId: c.batchId, hasLab: c.hasLab, subjectHomeDepartmentId: c.subjectHomeDepartmentId, followsBase: !!c.contentSyncMember && !c.contentSyncMember.isBase,
          batchName: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : null,
        }))}
        homeExperts={await homeExpertsFor(owningChairmanId || "", user.id, courses.map((c) => c.subjectHomeDepartmentId || ""))}
        departments={departmentList.map((d) => ({ id: d.id, name: d.name }))}
        subjectExperts={subjectExperts.map((se) => ({ id: se.id, name: se.name }))}
        batches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))}
        curricula={curricula.map((c) => ({ id: c.id, authority: c.authority, title: c.title, version: c.version }))}
        selectedBatchId={selectedBatchId}
      />
    </Shell>
  );
}
