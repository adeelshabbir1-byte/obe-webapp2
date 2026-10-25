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
import { CourseBoard } from "../../../components/BatchBoard";
import BatchSetupSteps from "../../../components/BatchSetupSteps";
import SetupStrip from "../../../components/SetupStrip";
import { setupStatus, schemeChanges } from "../../../lib/batchSetup";
import { batchBoard, curriculumBoard } from "../../../lib/batchBoard";
import SlotChooser from "../../../components/SlotChooser";
import { slotChooser, slotChoicesOf } from "../../../lib/slotChoice";


export default async function CoordinatorCoursesPage({ searchParams }: { searchParams: { batchId?: string; preview?: string; pick?: string; setup?: string; step?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const selectedBatchId = searchParams.batchId || "";
  const owning = await findOwningChairmanId(user.id);
  const board = selectedBatchId ? await batchBoard(selectedBatchId) : null;
  const [setup, changes] = selectedBatchId ? await Promise.all([setupStatus(selectedBatchId).catch(() => null), schemeChanges(selectedBatchId)]) : [null, []];
  const sourceLabel = setup?.source ? (setup.source.how === "BATCH_AS_TAUGHT" ? "a previous batch, as it was taught" : board?.title && setup.source.curriculumId ? (await prisma.masterCurriculum.findUnique({ where: { id: setup.source.curriculumId }, select: { authority: true, title: true, version: true } }).then((c) => (c ? `${c.authority} ${c.title} ${c.version}` : "a curriculum"))) : "a curriculum") : "not recorded (older batch)";
  const step = ["home", "names", "electives", "ga"].includes(searchParams.step || "") ? searchParams.step! : "";
  const { setupProgress } = await import("../../../lib/setupProgress");
  const prog = selectedBatchId ? await setupProgress(selectedBatchId).catch(() => null) : null;
  const stepIdx = prog ? prog.steps.findIndex((x) => x.key === step) : -1;
  const nextUrl = prog && stepIdx >= 0 ? prog.steps[stepIdx + 1]?.url || null : null;
  const ownDepartmentId = selectedBatchId ? (await (await import("../../../lib/omcCommittee")).departmentOfBatch(selectedBatchId)).departmentId : null;
  // Home step: the courses each department already teaches (to say "same as …"), and the batch's same-as / not-offered choices.
  const deptCourses: Record<string, { id: string; code: string; title: string; program: string }[]> = {};
  const homePlans: Record<string, { mode: string; linkedCourseId: string | null }> = {};
  if (selectedBatchId && step === "home" && owning) {
    const dps = await prisma.departmentProgram.findMany({ where: { chairmanId: owning }, select: { departmentId: true, degreeProgram: true } });
    const others = await prisma.course.findMany({ where: { batchId: { not: selectedBatchId }, coordinator: { managedById: owning }, courseType: { notIn: LIST_TYPES } }, orderBy: { createdAt: "desc" }, take: 4000, select: { id: true, code: true, title: true, subjectHomeDepartmentId: true, batch: { select: { degreeProgram: true } } } });
    const seen = new Set<string>();
    for (const c of others) {
      const prog2 = c.batch?.degreeProgram || "";
      const dept = c.subjectHomeDepartmentId || dps.find((d) => d.degreeProgram === prog2)?.departmentId; if (!dept) continue;
      const k = `${dept}|${c.code.toUpperCase()}`; if (seen.has(k)) continue; seen.add(k);
      (deptCourses[dept] ||= []).push({ id: c.id, code: c.code, title: c.title, program: prog2 });
    }
    for (const r of ((await (prisma as unknown as Record<string, any>).courseHomePlan.findMany({ where: { courseId: { in: (setup?.rows || []).map((x) => x.id).concat("none") } } }).catch(() => [])) as { courseId: string; mode: string; linkedCourseId: string | null }[])) homePlans[r.courseId] = { mode: r.mode, linkedCourseId: r.linkedCourseId };
  }
  let gaCheck: { noGa: { code: string; title: string }[]; unserved: { number: number; title: string }[] } | null = null;
  if (selectedBatchId && step === "ga") {
    const [cs, plos, maps] = await Promise.all([
      prisma.course.findMany({ where: { batchId: selectedBatchId, courseType: { notIn: LIST_TYPES } }, select: { id: true, code: true, title: true } }),
      prisma.pLO.findMany({ where: { batchId: selectedBatchId }, select: { id: true, number: true, title: true }, orderBy: { number: "asc" } }),
      prisma.coursePloMapping.findMany({ where: { plo: { batchId: selectedBatchId } }, select: { courseId: true, ploId: true } }),
    ]);
    gaCheck = { noGa: cs.filter((c) => !maps.some((m) => m.courseId === c.id)).map((c) => ({ code: c.code, title: c.title })), unserved: plos.filter((p2) => !maps.some((m) => m.ploId === p2.id)).map((p2) => ({ number: p2.number, title: p2.title })) };
  }
  const offered = selectedBatchId ? await (await import("../../../lib/batchSetup")).offeredTracks(selectedBatchId) : [];
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
      {selectedBatchId && board && board.courses.length === 0 && <div className="card" style={{ borderLeft: "5px solid #0D2A4A" }}><h3 style={{ marginTop: 0 }}>This batch has no courses yet</h3><p className="small-note">Choose where they come from — a curriculum (e.g. NCEAC) or a previous batch — step by step.</p><a className="btn" href={`/coordinator/batches/new?batchId=${selectedBatchId}`}>Set up this batch&apos;s courses →</a></div>}
      {selectedBatchId && searchParams.setup && step && <SetupStrip batchId={selectedBatchId} step={step as never} />}
      {selectedBatchId && setup && board && board.courses.length > 0 && <BatchSetupSteps batchId={selectedBatchId} step={step} ownDepartmentId={ownDepartmentId} deptCourses={deptCourses} homePlans={homePlans} gaCheck={gaCheck} nextUrl={nextUrl} setupUrl={prog?.current.url || `/coordinator/batches/new?batchId=${selectedBatchId}`} status={setup} departments={departmentList.map((d) => ({ id: d.id, name: d.name }))} sourceLabel={sourceLabel + (offered.length ? ` · tracks ${offered.map((t) => t.name).join(", ")}` : "")} types={board.types.map((t) => t.name)} changes={changes.map((c) => ({ ...c, at: new Date(c.at).toISOString() }))} />}
      {selectedBatchId && board && board.courses.length > 0 && <div className="card"><CourseBoard board={board} batchId={selectedBatchId} editable /></div>}
      {selectedBatchId && <SlotChooser batchId={selectedBatchId} groups={slotGroups} choices={slotChoices.map((c) => ({ courseId: c.courseId, byName: c.byName, at: new Date(c.at).toISOString() }))} />}
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
