import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { setupStatus } from "./batchSetup";
import { buildSnapshot, applySnapshot } from "./publicCourse";

// The guided set-up of a new batch: 13 steps spread over the pages that already do each job, joined by a progress strip
// (?setup=<batchId>). A step is done when its data says so (courses imported, every course synced or new, prerequisites
// confirmed, every course has a Subject Expert, sent to the OMC) or when the Program Lead marks it final. No step blocks
// a later one — only opening registration waits (see lib/sePlan.ts).

const db = prisma as unknown as Record<string, any>;
export type Mark = { by: string; byName: string; at: string };
export type FlowStep = { n: number; key: string; title: string; href: string; done: boolean; auto: boolean; mark: Mark | null; note: string };
export type Flow = { batchId: string; label: string; steps: FlowStep[]; done: number; current: number; sent: boolean; approved: boolean };

export const STEP_TITLES = [
  "Batch", "Source", "Tracks", "Preview & import", "Sync & equalise", "Home department of new courses", "Final names & codes",
  "Semester positions", "Prerequisites", "Electives / IDS", "Subject Experts", "GA mapping check", "Review & send to OMC",
] as const;
export const STEP_KEYS = ["batch", "source", "tracks", "import", "sync", "home", "names", "positions", "prereq", "electives", "se", "ga", "review"] as const;
export const TOTAL_STEPS = STEP_TITLES.length;

/** Where each step is done (the existing page for that job), with the set-up strip switched on. */
export function stepHref(n: number, batchId: string, hasCourses = true) {
  const q = `batchId=${batchId}&setup=${batchId}`;
  switch (n) {
    case 1: case 2: case 3: case 4: return hasCourses ? `/coordinator/courses?${q}&step=${n}#setup` : `/coordinator/batches/new?batchId=${batchId}&setup=${batchId}`;
    case 5: return `/omc/content-sync?${q}`;
    case 6: return `/coordinator/courses?${q}&step=6#home`;
    case 7: return `/coordinator/courses?${q}&step=7#names`;
    case 8: return `/omc/course-repositioning?${q}`;
    case 9: return `/coordinator/prerequisite-map?${q}`;
    case 10: return `/coordinator/courses?${q}&step=10#electives`;
    case 11: return `/coordinator/assign-subject-experts?${q}`;
    case 12: return `/omc/plo-matrix?${q}`;
    default: return `/coordinator/batch-review?${q}`;
  }
}

async function progressOf(batchId: string): Promise<{ marks: Record<string, Mark>; currentStep: number; startedAt: Date | null }> {
  const p = await db.batchSetupProgress.findUnique({ where: { batchId } }).catch(() => null);
  if (!p) return { marks: {}, currentStep: 1, startedAt: null };
  let marks: Record<string, Mark> = {};
  try { marks = JSON.parse(p.marksJson || "{}"); } catch { marks = {}; }
  return { marks, currentStep: p.currentStep || 1, startedAt: p.startedAt };
}

/** The 13 steps of a batch with what is done, by whom and when. */
export async function flowOf(batchId: string): Promise<Flow | null> {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true, prerequisitesConfirmedAt: true } });
  if (!b) return null;
  const [st, prog, courses, approval, slots] = await Promise.all([
    setupStatus(batchId),
    progressOf(batchId),
    prisma.course.findMany({ where: { batchId }, select: { id: true, courseType: true, subjectExpertId: true } }),
    db.batchApproval.findUnique({ where: { batchId } }).catch(() => null),
    db.electiveSlotGroup?.count ? db.electiveSlotGroup.count({ where: { batchId } }).catch(() => 0) : Promise.resolve(0),
  ]);
  const real = courses.filter((c) => !LIST_TYPES.includes(c.courseType));
  const has = courses.length > 0;
  const noSe = real.filter((c) => !c.subjectExpertId).length;
  const synced = st ? st.rows.filter((r) => r.matched).length : 0, total = st ? st.rows.length : 0, isNew = st ? st.rows.filter((r) => r.isNew).length : 0;
  const m = (n: number) => prog.marks[String(n)] || null;
  const auto: Record<number, [boolean, string]> = {
    1: [true, ""],
    2: [has, has ? "" : "Choose one curriculum or one previous batch"],
    3: [has, ""],
    4: [has, has ? `${courses.length} courses` : ""],
    5: [has && !!st && st.open === 0, st ? `Synced ${synced} of ${total}${isNew ? ` · ${isNew} new` : ""}` : ""],
    6: [has && !!st && st.noHome === 0, st && st.noHome ? `${st.noHome} without a home department` : ""],
    // Names and codes can only be settled once the courses are synced (step 5).
    7: [has && !!st && st.open === 0 && st.naming.length === 0, st && st.naming.length ? `${st.naming.length} to decide` : st && st.open ? "after sync & equalise" : ""],
    9: [!!b.prerequisitesConfirmedAt, b.prerequisitesConfirmedAt ? "Confirmed" : ""],
    10: [has && slots === 0, ""],
    11: [has && noSe === 0, noSe ? `${noSe} course(s) without a Subject Expert` : "Every course has one"],
    13: [!!approval, approval ? (approval.status === "APPROVED" ? "Approved by the OMC" : "With the OMC") : ""],
  };
  const steps: FlowStep[] = STEP_TITLES.map((title, i) => {
    const n = i + 1;
    const a = auto[n];
    const mark = m(n);
    // Steps with nothing to detect (positions, GA check, electives when the batch has slots) are done when marked final.
    const done = a ? a[0] || (n !== 13 && n !== 11 && n !== 9 && n !== 5 && n !== 6 && !!mark) : !!mark;
    return { n, key: STEP_KEYS[i], title, href: stepHref(n, batchId, has), done, auto: !!a, mark, note: a?.[1] || "" };
  });
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.n || TOTAL_STEPS;
  return { batchId, label: `${b.degreeProgram} ${b.batchName}`, steps, done, current, sent: !!approval, approved: approval?.status === "APPROVED" };
}

/** "This step is final" — kept with who and when. */
export async function markStep(batchId: string, n: number, by: { id: string; name: string }, on = true) {
  if (!(n >= 1 && n <= TOTAL_STEPS)) throw new Error("Unknown step.");
  const prog = await progressOf(batchId);
  const marks = { ...prog.marks };
  if (on) marks[String(n)] = { by: by.id, byName: by.name, at: new Date().toISOString() }; else delete marks[String(n)];
  const currentStep = Math.min(TOTAL_STEPS, on ? Math.max(prog.currentStep, n + 1) : prog.currentStep);
  await db.batchSetupProgress.upsert({ where: { batchId }, create: { batchId, marksJson: JSON.stringify(marks), currentStep }, update: { marksJson: JSON.stringify(marks), currentStep, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: by.id, action: on ? "BATCH_SETUP_STEP_DONE" : "BATCH_SETUP_STEP_REOPENED", entityType: "Batch", entityId: batchId, metadata: { step: n, title: STEP_TITLES[n - 1] } }).catch(() => null);
}

/** Start (or continue) the guided set-up: step 1 is done the moment the batch exists. */
export async function startFlow(batchId: string, by: { id: string; name: string }) {
  const p = await db.batchSetupProgress.findUnique({ where: { batchId } }).catch(() => null);
  if (!p) await markStep(batchId, 1, by).catch(() => null);
}

/** For the Batches page: "7 of 13 · Continue set-up →" for every batch still being set up. */
export async function flowSummaries(batchIds: string[]) {
  const out = new Map<string, { done: number; current: number; href: string; approved: boolean; sent: boolean }>();
  const started = ((await db.batchSetupProgress.findMany({ where: { batchId: { in: batchIds.concat("none") } }, select: { batchId: true } }).catch(() => [])) as { batchId: string }[]).map((r) => r.batchId);
  for (const id of started) {
    const f = await flowOf(id).catch(() => null);
    if (f) out.set(id, { done: f.done, current: f.current, href: stepHref(f.current, id, f.steps[3].done), approved: f.approved, sent: f.sent });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- synced course defaults
/** The course taught before that this batch's course is synced with: the newest member of its content-sync group in an earlier batch. */
export async function previousOf(courseId: string) {
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId } });
  if (!m) return null;
  const others = await prisma.courseContentSyncMember.findMany({ where: { groupId: m.groupId, courseId: { not: courseId } }, select: { course: { select: { id: true, code: true, title: true, semesterNumber: true, subjectExpertId: true, subjectHomeDepartmentId: true, templateStatus: true, createdAt: true, templateReviewedById: true, batch: { select: { degreeProgram: true, batchName: true, startYear: true, startTerm: true } } } } } });
  const me = await prisma.course.findUnique({ where: { id: courseId }, select: { createdAt: true } });
  // Only a course created before this one is "taught before" (never the other way round).
  const c = others.map((o) => o.course).filter((c) => c.batch && (!me || +c.createdAt < +me.createdAt)).sort((a, b) => +b.createdAt - +a.createdAt)[0];
  return c || null;
}

/**
 * A synced course takes the previous batch course's semester (unless the Program Lead moved it by hand), home department
 * and Subject Expert, and that course's plan comes with it — an OMC-approved plan counts as approved here too, with a
 * recheck warning. New courses keep the curriculum's semester. Returns what changed.
 */
export async function applySyncDefaults(courseIds: string[], byId: string) {
  let moved = 0, ses = 0, plans = 0;
  const manual = new Set(((await db.batchCourseManual.findMany({ where: { courseId: { in: courseIds.concat("none") } } }).catch(() => [])) as { courseId: string }[]).map((r) => r.courseId));
  for (const id of courseIds) {
    const c = await prisma.course.findUnique({ where: { id }, select: { id: true, batchId: true, semesterNumber: true, subjectExpertId: true, subjectHomeDepartmentId: true, templateStatus: true, isOffered: true, _count: { select: { studentMarks: true } } } });
    const p = c ? await previousOf(id) : null;
    if (!c || !p || !c.batchId) continue;
    const data: Record<string, unknown> = {};
    const origin = await db.batchCourseOrigin.findUnique({ where: { courseId: id } }).catch(() => null);
    if (!manual.has(id) && !c.isOffered && p.semesterNumber && p.semesterNumber !== c.semesterNumber) { data.semesterNumber = p.semesterNumber; moved++; }
    if (!c.subjectHomeDepartmentId && p.subjectHomeDepartmentId) data.subjectHomeDepartmentId = p.subjectHomeDepartmentId;
    if (!c.subjectExpertId && p.subjectExpertId) { data.subjectExpertId = p.subjectExpertId; ses++; }
    // The plan comes with the sync while this course's own plan is still a draft and nobody has marks in it.
    let carried = false;
    if ((c.templateStatus === "draft" || !c.templateStatus) && !c._count.studentMarks) {
      const snap = await buildSnapshot(p.id, "SE").catch(() => null);
      if (snap && snap.clos.length) {
        await applySnapshot(snap, id, "SE", byId).catch(() => null);
        plans++;
        if (p.templateStatus === "approved") { data.templateStatus = "approved"; carried = true; }
      }
    }
    if (Object.keys(data).length) await prisma.course.update({ where: { id }, data: data as never });
    await db.batchCourseOrigin.upsert({
      where: { courseId: id },
      create: { courseId: id, batchId: c.batchId, fromCourseId: p.id, fromBatchName: `${p.batch?.degreeProgram || ""} ${p.batch?.batchName || ""}`.trim(), semester: p.semesterNumber, curriculumSemester: origin?.curriculumSemester ?? c.semesterNumber },
      update: { fromCourseId: p.id, fromBatchName: `${p.batch?.degreeProgram || ""} ${p.batch?.batchName || ""}`.trim(), semester: p.semesterNumber },
    }).catch(() => null);
    if (carried) {
      const approvedAt = await lastApprovalDate(p.id);
      await db.sePlanState.upsert({
        where: { courseId: id },
        create: { courseId: id, carriedFromCourseId: p.id, carriedFromBatch: `${p.batch?.degreeProgram || ""} ${p.batch?.batchName || ""}`.trim(), carriedApprovedAt: approvedAt },
        update: { carriedFromCourseId: p.id, carriedFromBatch: `${p.batch?.degreeProgram || ""} ${p.batch?.batchName || ""}`.trim(), carriedApprovedAt: approvedAt, recheckedAt: null, updatedAt: new Date() },
      }).catch(() => null);
    }
  }
  return { moved, ses, plans };
}

async function lastApprovalDate(courseId: string): Promise<Date | null> {
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  if (s?.approvedAt) return s.approvedAt;
  const a = await prisma.auditLog.findFirst({ where: { entityId: courseId, action: { in: ["TEMPLATE_APPROVED", "OMC_TEMPLATE_APPROVED", "TEMPLATE_STATUS_CHANGED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
  return a?.createdAt || null;
}

/** The Program Lead moved this course's semester by hand: sync never moves it again. */
export async function markManual(courseId: string, byId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { batchId: true } });
  if (!c?.batchId) return;
  await db.batchCourseManual.upsert({ where: { courseId }, create: { courseId, batchId: c.batchId, byId }, update: { byId, at: new Date() } }).catch(() => null);
}

/** For the board: "S5 (as in BSCS Fall 2026)" on courses that took their semester from the previous batch. */
export async function originsOf(batchId: string) {
  const rows = ((await db.batchCourseOrigin.findMany({ where: { batchId } }).catch(() => [])) as { courseId: string; fromBatchName: string; semester: number | null }[]);
  const manual = new Set(((await db.batchCourseManual.findMany({ where: { batchId } }).catch(() => [])) as { courseId: string }[]).map((r) => r.courseId));
  return new Map(rows.map((r) => [r.courseId, { from: r.fromBatchName, semester: r.semester, manual: manual.has(r.courseId) }]));
}

/** A batch's courses can't be offered while set-up steps 5–6 (sync & equalise, home departments) are unfinished. */
export async function offerBlock(batchId: string | null | undefined): Promise<string | null> {
  if (!batchId) return null;
  const st = await setupStatus(batchId).catch(() => null);
  if (!st || st.done) return null;
  return `This batch's set-up isn't finished: ${st.open ? `${st.open} course(s) still to sync or mark new (step 5)` : ""}${st.open && st.noHome ? " and " : ""}${st.noHome ? `${st.noHome} without a home department (step 6)` : ""}. Its courses can be offered once that is done.`;
}

/**
 * Step 11 defaults: a synced course gets the previous course's Subject Expert; a new course gets the university owner of
 * its curriculum course (else last time's SE of the same code). Only courses still without a Subject Expert are filled.
 */
export async function fillSeDefaults(batchId: string, byId: string) {
  const { defaultSubjectExpert } = await import("./universityCurriculum");
  const cs = await prisma.course.findMany({ where: { batchId, subjectExpertId: null, courseType: { notIn: LIST_TYPES } }, select: { id: true, code: true, masterCourseId: true, coordinatorId: true } });
  let synced = 0, owner = 0;
  for (const c of cs) {
    const p = await previousOf(c.id);
    let se = p?.subjectExpertId || null;
    if (se) synced++;
    else { const d = await defaultSubjectExpert(c.masterCourseId, c.coordinatorId, c.code).catch(() => null); se = d?.id || null; if (se) owner++; }
    if (se) await prisma.course.update({ where: { id: c.id }, data: { subjectExpertId: se } });
  }
  if (synced || owner) await writeAuditLog({ actorUserId: byId, action: "BATCH_SE_DEFAULTS", entityType: "Batch", entityId: batchId, metadata: { synced, owner } }).catch(() => null);
  const left = await prisma.course.findMany({ where: { batchId, subjectExpertId: null, courseType: { notIn: LIST_TYPES } }, select: { code: true } });
  return { synced, owner, left: left.map((x) => x.code) };
}
