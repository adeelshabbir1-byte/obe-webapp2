import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { buildSnapshot, applySnapshot, type Snapshot } from "./publicCourse";

// The university curriculum is the main copy. National (council) curriculum → University curriculum (with revisions) →
// Batch course. New batches take each course from the university curriculum's latest plan; a change made in a batch
// reaches it only through OMC → BOS (minutes attached) → OMC forwards → new revision.

export const udb = prisma as unknown as Record<string, any>;
export const UC_HINT = "University curriculum tables are not set up yet — run the latest migration (System Health → Run migrations).";
const COUNCILS = ["HEC", "NCEAC", "NBEAC", "PEC", "PMDC", "PNC", "PBC"];

// ---------------------------------------------------------------- source badge
export type Source = { kind: string; label: string; color: string; basedOn: string | null };
export function sourceOf(c: { authority: string; chairmanId: string | null; parentCurriculum?: { authority: string; title: string; version: string } | null }, override?: string | null): Source {
  const k = override || (c.chairmanId ? "UNIVERSITY" : COUNCILS.includes(c.authority.toUpperCase()) ? c.authority.toUpperCase() : "OTHER");
  const based = c.parentCurriculum ? `based on ${c.parentCurriculum.authority} ${cleanVersion(c.parentCurriculum.title)} ${cleanVersion(c.parentCurriculum.version)}` : null;
  return { kind: k, label: k === "UNIVERSITY" ? "University" : k === "OTHER" ? "Other" : k, color: k === "UNIVERSITY" ? "#7A2E3B" : k === "OTHER" ? "#6B7177" : "#1565C0", basedOn: k === "UNIVERSITY" ? based : null };
}
export const cleanVersion = (v: string) => v.replace(/\s*\(your copy\)\s*/gi, "").trim();

// ---------------------------------------------------------------- revisions and course plans
export type Revision = { id: string; curriculumId: string; number: number; note: string; itemsJson: string; createdById: string; createdAt: Date };
export async function currentRevision(curriculumId: string): Promise<number> {
  const r = (await udb.curriculumRevision.findFirst({ where: { curriculumId }, orderBy: { number: "desc" } }).catch(() => null)) as Revision | null;
  return r?.number || 0;
}
export async function revisionsOf(curriculumId: string) {
  return ((await udb.curriculumRevision.findMany({ where: { curriculumId }, orderBy: { number: "desc" } }).catch(() => [])) as Revision[]);
}
/** The university's approved plan for a curriculum course (full: CLOs, lecture plan, assessments, paper blueprint). */
export async function coursePlan(masterCourseId: string) {
  const p = (await udb.universityCoursePlan.findUnique({ where: { masterCourseId } }).catch(() => null)) as { snapshotJson: string; revision: number } | null;
  if (!p) return null;
  try { return { snapshot: JSON.parse(p.snapshotJson) as Snapshot, revision: p.revision }; } catch { return null; }
}
/** Seed a new batch course from the university plan (if any). Returns true when it did. */
export async function seedFromUniversityPlan(courseId: string, masterCourseId: string | null, byId: string) {
  if (!masterCourseId) return false;
  const p = await coursePlan(masterCourseId);
  if (!p) return false;
  await applySnapshot(p.snapshot, courseId, "SE", byId);
  return true;
}
/** Record which curriculum + revision a batch started from (and how). */
export async function recordBatchSource(batchId: string, curriculumId: string | null, how: string, fromBatchId: string | null = null) {
  const revision = curriculumId ? await currentRevision(curriculumId) : 0;
  await udb.batchCurriculumSource.upsert({ where: { batchId }, create: { batchId, curriculumId, revision, how, fromBatchId }, update: { curriculumId, revision, how, fromBatchId, at: new Date() } }).catch(() => null);
}
export async function batchSource(batchId: string) {
  return (await udb.batchCurriculumSource.findUnique({ where: { batchId } }).catch(() => null)) as { batchId: string; curriculumId: string | null; revision: number; how: string; fromBatchId: string | null } | null;
}

// ---------------------------------------------------------------- Subject Expert owner of a curriculum course
/** The SE a new batch course gets: the university curriculum course's owner, else last time's SE of the same course. */
export async function defaultSubjectExpert(masterCourseId: string | null, coordinatorId: string, code: string): Promise<{ id: string; from: "OWNER" | "LAST" } | null> {
  if (masterCourseId) {
    const mc = await prisma.masterCourse.findUnique({ where: { id: masterCourseId }, select: { designerId: true, masterCurriculum: { select: { chairmanId: true } } } });
    if (mc?.designerId && mc.masterCurriculum.chairmanId) return { id: mc.designerId, from: "OWNER" };
  }
  const last = await prisma.course.findFirst({ where: { coordinatorId, subjectExpertId: { not: null }, OR: masterCourseId ? [{ masterCourseId }, { code }] : [{ code }] }, orderBy: { createdAt: "desc" }, select: { subjectExpertId: true } });
  return last?.subjectExpertId ? { id: last.subjectExpertId, from: "LAST" } : null;
}
export async function assignDefaultSubjectExpert(courseId: string, byId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, masterCourseId: true, coordinatorId: true, subjectExpertId: true } });
  if (!c || c.subjectExpertId) return null;
  const d = await defaultSubjectExpert(c.masterCourseId, c.coordinatorId, c.code);
  if (!d) return null;
  await prisma.course.update({ where: { id: c.id }, data: { subjectExpertId: d.id } });
  await notifyUsers([d.id], { kind: "ASSIGNMENT", title: `You are the Subject Expert of ${c.code} ${c.title} for a new batch`, body: d.from === "OWNER" ? "You own this course in the university curriculum." : "You were its Subject Expert last time — the Program Lead will confirm.", href: `/subjectexpert/courses/${c.id}/clos` }).catch(() => null);
  await writeAuditLog({ actorUserId: byId, action: "SE_DEFAULT_ASSIGNED", entityType: "Course", entityId: c.id, metadata: { subjectExpertId: d.id, from: d.from } });
  return d;
}
/** Program Lead: make a batch course's SE the owner of the course in the university curriculum (all future batches). */
export async function setOwner(byId: string, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectExpertId: true, masterCourseId: true, masterCourse: { select: { masterCurriculum: { select: { chairmanId: true } } } } } });
  if (!c?.subjectExpertId || !c.masterCourseId) throw new Error("Assign a Subject Expert first (and the course must come from a curriculum).");
  if (!c.masterCourse?.masterCurriculum.chairmanId) throw new Error("This course comes from a national curriculum: make a university copy of it to set owners.");
  await prisma.masterCourse.update({ where: { id: c.masterCourseId }, data: { designerId: c.subjectExpertId } });
  await writeAuditLog({ actorUserId: byId, action: "UNIVERSITY_COURSE_OWNER_SET", entityType: "MasterCourse", entityId: c.masterCourseId, metadata: { subjectExpertId: c.subjectExpertId } });
  return "This Subject Expert now owns the course in the university curriculum; future batches get them automatically.";
}

// ---------------------------------------------------------------- recommendations: SE / OMC → BOS → OMC forwards
export type Rec = {
  id: string; chairmanId: string; courseId: string; masterCourseId: string | null; curriculumId: string | null; kind: string; summary: string; reason: string | null;
  snapshotJson: string; status: string; proposedById: string; omcById: string | null; bosMinutesId: string | null; bosItem: string | null; bosNote: string | null; revision: number | null; createdAt: Date; updatedAt: Date;
};
export const REC_STATUS: Record<string, string> = { OMC_REVIEW: "Waiting for OMC", BATCH_ONLY: "This batch only", BOS_PENDING: "On the BOS list", BOS_APPROVED: "BOS approved — OMC to forward", BOS_REJECTED: "BOS rejected", BOS_DEFERRED: "BOS deferred", APPLIED: "In the university curriculum" };

/** A Subject Expert (their plan, or the instructor's delivery copy they adopt) proposes a change for future batches. */
export async function propose(by: { id: string }, courseId: string, a: { plan: "SE" | "INSTRUCTOR"; summary: string; reason?: string; chairmanId: string }) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, masterCourseId: true, instructorId: true, masterCourse: { select: { masterCurriculumId: true, masterCurriculum: { select: { chairmanId: true } } } } } });
  if (!c) throw new Error("Course not found.");
  const snap = await buildSnapshot(courseId, a.plan);
  if (!snap || !snap.clos.length) throw new Error("That plan has no CLOs yet.");
  const summary = a.summary.trim().slice(0, 1000);
  if (summary.length < 5) throw new Error("Say what changes (e.g. \"Added CLO-5 on testing; lectures 20–24 reordered\").");
  const id = crypto.randomUUID();
  await udb.curriculumRecommendation.create({ data: { id, chairmanId: a.chairmanId, courseId, masterCourseId: c.masterCourseId, curriculumId: c.masterCourse?.masterCurriculum.chairmanId ? c.masterCourse.masterCurriculumId : null, kind: a.plan === "INSTRUCTOR" ? "INSTRUCTOR_ADOPTED" : "SE_CHANGE", summary, reason: a.reason?.trim().slice(0, 1000) || null, snapshotJson: JSON.stringify(snap), status: "OMC_REVIEW", proposedById: by.id } });
  const omc = await prisma.user.findMany({ where: { role: "OMC", managedById: a.chairmanId, isActive: true }, select: { id: true } });
  await notifyUsers(omc.map((o) => o.id), { kind: "ASSIGNMENT", title: `Change proposed for future batches: ${c.code} ${c.title}`, body: summary, href: "/curriculum-changes" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "CURRICULUM_CHANGE_PROPOSED", entityType: "Course", entityId: courseId, metadata: { recId: id, plan: a.plan } });
  return "Sent to the OMC. They decide whether it is for this batch only or goes to the Board of Studies for future batches.";
}

export async function recsFor(chairmanId: string) {
  const rs = ((await udb.curriculumRecommendation.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 300 })) as Rec[]);
  const courses = await prisma.course.findMany({ where: { id: { in: rs.map((r) => r.courseId).concat("none") } }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const people = await prisma.user.findMany({ where: { id: { in: rs.map((r) => r.proposedById).concat("none") } }, select: { id: true, name: true } });
  return rs.map((r) => ({ ...r, course: courses.find((c) => c.id === r.courseId) || null, by: people.find((p) => p.id === r.proposedById)?.name || "" }));
}

/** OMC: this batch only, or recommend to the BOS. */
export async function omcDecide(by: { id: string }, chairmanId: string, recId: string, decision: "BATCH_ONLY" | "BOS_PENDING", note: string) {
  const r = (await udb.curriculumRecommendation.findFirst({ where: { id: recId, chairmanId } })) as Rec | null;
  if (!r || r.status !== "OMC_REVIEW") throw new Error("Not waiting for the OMC.");
  if (decision === "BATCH_ONLY" && note.trim().length < 3) throw new Error("Give the reason it is for this batch only (e.g. strike, lost weeks).");
  await udb.curriculumRecommendation.update({ where: { id: recId }, data: { status: decision, omcById: by.id, reason: note.trim() ? `${r.reason ? `${r.reason} · ` : ""}OMC: ${note.trim()}` : r.reason, updatedAt: new Date() } });
  await notifyUsers([r.proposedById], { kind: "ASSIGNMENT", title: decision === "BATCH_ONLY" ? "Your change stays in this batch only" : "Your change is on the Board of Studies list", body: note || r.summary, href: "/curriculum-changes" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "CURRICULUM_CHANGE_OMC", entityType: "CurriculumRecommendation", entityId: recId, metadata: { decision } });
  return decision === "BATCH_ONLY" ? "Kept for this batch only; future batches are not affected." : "Added to the Board of Studies recommendations list.";
}

/** BOS decision, with the signed minutes attached (a BOS meeting record). */
export async function bosDecide(by: { id: string }, chairmanId: string, recId: string, decision: "BOS_APPROVED" | "BOS_REJECTED" | "BOS_DEFERRED", minutesId: string, item: string, note: string) {
  const r = (await udb.curriculumRecommendation.findFirst({ where: { id: recId, chairmanId } })) as Rec | null;
  if (!r || !["BOS_PENDING", "BOS_DEFERRED"].includes(r.status)) throw new Error("Not on the BOS list.");
  const m = minutesId ? await prisma.meetingMinutes.findFirst({ where: { id: minutesId, chairmanId, kind: "BOS" }, select: { id: true, data: true, fileName: true } }) : null;
  if (decision === "BOS_APPROVED" && (!m || !m.data)) throw new Error("Attach the BOS meeting whose signed minutes are uploaded (Meetings → BOS) before approving.");
  await udb.curriculumRecommendation.update({ where: { id: recId }, data: { status: decision, bosMinutesId: m?.id || null, bosItem: item.trim().slice(0, 60) || null, bosNote: note.trim().slice(0, 1000) || null, updatedAt: new Date() } });
  await notifyUsers([r.proposedById, ...(r.omcById ? [r.omcById] : [])], { kind: "ASSIGNMENT", title: `Board of Studies: ${decision === "BOS_APPROVED" ? "approved" : decision === "BOS_REJECTED" ? "rejected" : "deferred"} — ${r.summary.slice(0, 80)}`, body: note, href: "/curriculum-changes" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "CURRICULUM_CHANGE_BOS", entityType: "CurriculumRecommendation", entityId: recId, metadata: { decision, minutesId: m?.id || null } });
  return decision === "BOS_APPROVED" ? "Approved — the OMC can now forward it to the university curriculum." : "Saved; the Subject Expert is told.";
}

/** OMC forwards a BOS-approved change into the university curriculum: the course's plan, its CLOs and lecture topics; a new revision. */
export async function forward(by: { id: string }, chairmanId: string, recId: string) {
  const r = (await udb.curriculumRecommendation.findFirst({ where: { id: recId, chairmanId } })) as Rec | null;
  if (!r || r.status !== "BOS_APPROVED") throw new Error("Only BOS-approved changes can be forwarded.");
  if (!r.masterCourseId || !r.curriculumId) throw new Error("This course doesn't come from a university curriculum copy — make the university's copy of its curriculum first (Curricula → copy).");
  const snap = JSON.parse(r.snapshotJson) as Snapshot;
  const number = (await currentRevision(r.curriculumId)) + 1;
  // Course plan (full) for new batches.
  await udb.universityCoursePlan.upsert({ where: { masterCourseId: r.masterCourseId }, create: { masterCourseId: r.masterCourseId, snapshotJson: r.snapshotJson, revision: number }, update: { snapshotJson: r.snapshotJson, revision: number, updatedAt: new Date() } });
  // Keep the curriculum course's CLOs and lecture topics in step (what the Library and builder show).
  const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: r.curriculumId }, select: { id: true, number: true } });
  const ploId = new Map(plos.map((p) => [p.number, p.id]));
  await prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: r.masterCourseId } });
  await prisma.masterCourseClo.deleteMany({ where: { masterCourseId: r.masterCourseId } }).catch(() => null);
  await prisma.masterCourseClo.createMany({ data: snap.clos.map((c, i) => ({ masterCourseId: r.masterCourseId!, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: i, mappedPloId: c.ploNumber != null ? ploId.get(c.ploNumber) || null : null, ploMappingSource: c.ploNumber != null ? "MANUAL" : null })) });
  const cloNo = new Map(snap.clos.map((c, i) => [c.code, i + 1]));
  await prisma.masterCourseTopic.createMany({ data: snap.lectureRows.slice(0, 48).map((l) => ({ masterCourseId: r.masterCourseId!, lectureNumber: l.lectureNumber, topic: l.topic.slice(0, 500), subtopic: l.subtopic, cloNumber: l.cloCode ? cloNo.get(l.cloCode) || null : null })), skipDuplicates: true });
  if (snap.textbook || snap.catalogDescription || snap.referenceMaterial) await prisma.masterCourse.update({ where: { id: r.masterCourseId }, data: { ...(snap.textbook ? { textbook: snap.textbook } : {}), ...(snap.catalogDescription ? { catalogDescription: snap.catalogDescription } : {}), ...(snap.referenceMaterial ? { referenceMaterial: snap.referenceMaterial } : {}) } });
  const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true, title: true } });
  await udb.curriculumRevision.create({ data: { id: crypto.randomUUID(), curriculumId: r.curriculumId, number, note: `${c?.code || ""} ${c?.title || ""}: ${r.summary}`.slice(0, 2000), itemsJson: JSON.stringify([{ recId: r.id, masterCourseId: r.masterCourseId, bosMinutesId: r.bosMinutesId, bosItem: r.bosItem, proposedById: r.proposedById, omcById: r.omcById }]), createdById: by.id } });
  await udb.curriculumRecommendation.update({ where: { id: recId }, data: { status: "APPLIED", revision: number, updatedAt: new Date() } });
  // Running batches are told, not changed mid-semester.
  const running = await prisma.course.findMany({ where: { masterCourseId: r.masterCourseId, id: { not: r.courseId } }, select: { subjectExpertId: true, instructorId: true } });
  await notifyUsers(Array.from(new Set(running.flatMap((x) => [x.subjectExpertId, x.instructorId]).filter((x): x is string => !!x))), { kind: "ASSIGNMENT", title: `University curriculum updated: ${c?.code} ${c?.title} (rev ${number})`, body: "New batches get it. Your running course is not changed; adopt it if you wish.", href: "/curriculum-changes" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "CURRICULUM_CHANGE_FORWARDED", entityType: "MasterCurriculum", entityId: r.curriculumId, metadata: { recId, revision: number } });
  return `Forwarded — university curriculum is now revision ${number}. New batches get this plan.`;
}
