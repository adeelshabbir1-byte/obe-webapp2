import { redirect } from "next/navigation";
import { subjectExpertWhere } from "../../../lib/dualRoles";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { homeExpertsFor } from "../../../lib/homeExperts";
import CoursesManager from "../../../components/CoursesManager";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { degreeSortKey } from "../../../lib/curriculumAccess";
import { navForRole } from "../../../components/reportNav";
import { ActionButton } from "../../../components/fyp/FypClient";
import { LIST_TYPES } from "../../../lib/autoCopyPreviousBatch";
import { CourseBoard, SourcePicker } from "../../../components/BatchBoard";
import { batchBoard, curriculumBoard, sourcesFor } from "../../../lib/batchBoard";
import SlotChooser from "../../../components/SlotChooser";
import { slotChooser, slotChoicesOf } from "../../../lib/slotChoice";


export default async function CoordinatorCoursesPage({ searchParams }: { searchParams: { batchId?: string; preview?: string; pick?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const selectedBatchId = searchParams.batchId || "";
  const owning = await findOwningChairmanId(user.id);
  const [board, sources] = selectedBatchId ? await Promise.all([batchBoard(selectedBatchId), owning ? sourcesFor(user, owning, selectedBatchId) : Promise.resolve([])]) : [null, []];
  const pv = searchParams.preview || "";
  const allBatchesForPick = !selectedBatchId && pv ? await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ startYear: "desc" }], take: 12, select: { id: true, degreeProgram: true, batchName: true } }) : [];
  const preview = pv.startsWith("c:") ? await curriculumBoard(pv.slice(2)) : pv.startsWith("b:") && (await prisma.batch.findFirst({ where: { id: pv.slice(2), coordinator: { managedById: owning || "none" } }, select: { id: true } })) ? await batchBoard(pv.slice(2)) : null;
  const [slotGroups, slotChoices] = selectedBatchId ? await Promise.all([slotChooser(selectedBatchId).catch(() => []), slotChoicesOf(selectedBatchId)]) : [[], []];
  const listCount = selectedBatchId ? await prisma.course.count({ where: { batchId: selectedBatchId, courseType: { in: LIST_TYPES } } }) : 0;

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
    ? await prisma.masterCurriculum.findMany({ where: { status: "PUBLISHED", ...(await (await import("../../../lib/curriculumLibrary")).curriculaWhere(owningChairmanId)) } })
    : [];
  const copiedFrom = new Set(visible.filter((c) => c.chairmanId && c.parentCurriculumId).map((c) => c.parentCurriculumId));
  const curricula = visible
    .filter((c) => c.chairmanId || !copiedFrom.has(c.id))
    .sort((a, b) => degreeSortKey(a).localeCompare(degreeSortKey(b)) || a.authority.localeCompare(b.authority) || b.version.localeCompare(a.version));

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Catalog</h1>
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
      {!selectedBatchId && preview && <div className="card" id="sources"><h3 style={{ marginTop: 0 }}>Use this curriculum for a batch</h3><p className="small-note">Pick the batch: {allBatchesForPick.map((b) => <a key={b.id} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} href={`/coordinator/courses?batchId=${b.id}&preview=${searchParams.preview}#sources`}>{b.degreeProgram} — {b.batchName}</a>)}</p><CourseBoard board={preview} /></div>}
      {selectedBatchId && board && <div className="card"><CourseBoard board={board} batchId={selectedBatchId} editable /></div>}
      {selectedBatchId && <SlotChooser batchId={selectedBatchId} groups={slotGroups} choices={slotChoices.map((c) => ({ courseId: c.courseId, byName: c.byName, at: new Date(c.at).toISOString() }))} />}
      {selectedBatchId && <div className="card" id="sources">
        <h3 style={{ marginTop: 0 }}>{board && board.courses.length ? "Add courses from" : "Where should this batch's courses come from?"}</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Curricula of this program&apos;s discipline (the university&apos;s own first: new batches get its latest approved plan for each course) and earlier batches. <b>Preview</b> shows it as a board; <b>Import</b> brings it in. Elective / IDS lists stay in the curriculum as the pool you fill elective slots from.</p>
        <SourcePicker rows={sources} batchId={selectedBatchId} previewKey={searchParams.preview || ""} />
        {preview && <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}><div className="small-note" style={{ marginTop: 0 }}>Preview</div><CourseBoard board={preview} /></div>}
      </div>}
      {listCount > 0 && <div className="card" style={{ borderLeft: "5px solid #B26A00", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span><b>{listCount}</b> elective / IDS <b>list</b> courses are in this batch. A list is the pool students choose from — the batch only needs its elective slots, each filled from the list.</span>
        <ActionButton showMessage url={`/api/coordinator/batches/${selectedBatchId}/cleanup-lists`} body={{}} label="Remove the unchosen list courses" className="btn btn-sm" confirmText={`Remove ${listCount} elective-list course(s) from this batch? Courses with students, marks or attendance are kept; filled elective slots are not touched.`} />
      </div>}
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
