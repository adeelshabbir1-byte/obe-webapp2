import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";

// Queue item 19: gaps found in the system workflow — one course CQI report, "it worked" notes, notes and "students
// struggled" flags on a lecture topic, HEC review of widely adopted course packages, labs in lockstep across
// campuses, and exam costs split between partners (in lib/examsExtra.ts allowance).
const db = prisma as unknown as Record<string, any>;
export const WG_HINT = "Run prisma/migration_adeel_p13.sql (System Health → database updates) first.";
export const STRUGGLE_SUGGEST = 2;
type U = { id: string; name: string; role: string };
export type Note = { id: string; courseId: string; lectureNumber: number | null; kind: string; userId: string; toUserId: string | null; cqiId: string | null; text: string; at: Date };

/** The course's people: who may read and write its notes and CQI report. */
export async function coursePeople(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, instructorId: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
}
export async function canSeeCourse(u: U, c: NonNullable<Awaited<ReturnType<typeof coursePeople>>>) {
  if ([c.instructorId, c.subjectExpertId, c.coordinatorId].includes(u.id)) return true;
  if (["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC"].includes(u.role)) { const { chairmanIdFor } = await import("./reportScope"); return (await chairmanIdFor(u as never).catch(() => "")) === (c.coordinator.managedById || c.coordinatorId); }
  return false;
}
/** One report: direct CLO results, students' self-ratings, the teacher's exit review, CQI records of this and earlier offerings, notes. */
export async function courseCqi(courseId: string) {
  const c = await coursePeople(courseId); if (!c) return null;
  const [self, review, cqis, notes] = await Promise.all([
    (await import("./cloSelf")).courseSelf(courseId).catch(() => ({ students: 0, clos: [] as { code: string; n: number; self: number | null; direct: number | null; gap: number | null; flag: string }[] })),
    db.courseReview?.findUnique({ where: { courseId } }).catch(() => null) as Promise<{ worked: string | null; challenges: string | null; changes: string | null; submittedAt: Date | null } | null>,
    prisma.cqiRecord.findMany({ where: { course: { code: c.code } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, finding: true, actionTaken: true, status: true, courseId: true, createdAt: true } }),
    notesOf(courseId),
  ]);
  return { course: c, self, review, cqis, notes };
}
export async function notesOf(courseId: string) { return ((await db.courseNote?.findMany({ where: { courseId }, orderBy: { at: "desc" } }).catch(() => null)) ?? null) as Note[] | null; }
/** A note or a "students struggled here" flag on a lecture topic; enough flags suggest a plan change to the OMC. */
export async function addNote(u: U, courseId: string, d: { lectureNumber?: number | null; kind: string; text: string; toUserId?: string | null; cqiId?: string | null }) {
  const c = await coursePeople(courseId); if (!c || !(await canSeeCourse(u, c))) throw new Error("Not your course.");
  const kind = ["NOTE", "STRUGGLE", "WORKED"].includes(d.kind) ? d.kind : "NOTE";
  const text = String(d.text || "").trim().slice(0, 2000); if (!text) throw new Error("Write the note.");
  await db.courseNote.create({ data: { id: randomUUID(), courseId, lectureNumber: d.lectureNumber ?? null, kind, userId: u.id, toUserId: d.toUserId || null, cqiId: d.cqiId || null, text } });
  if (kind === "WORKED" && d.toUserId) await notifyUsers([d.toUserId], { kind: "INFO", title: `${u.name}: the fix worked in ${c.code}`, body: text.slice(0, 200), href: `/course-cqi/${courseId}` });
  if (kind === "WORKED" && d.cqiId) await prisma.cqiRecord.updateMany({ where: { id: d.cqiId }, data: { status: "verified-effective", verifiedById: u.id, verifiedAt: new Date(), lastUpdatedById: u.id } });
  if (kind === "STRUGGLE" && d.lectureNumber != null) {
    const n = await db.courseNote.count({ where: { courseId, lectureNumber: d.lectureNumber, kind: "STRUGGLE" } });
    if (n === STRUGGLE_SUGGEST) await notifyUsers([c.coordinatorId, c.subjectExpertId], { kind: "APPROVAL", title: `${c.code} lecture ${d.lectureNumber}: ${n} "students struggled" flags`, body: "Consider a plan change for OMC sign-off.", href: `/course-cqi/${courseId}` });
  }
  await writeAuditLog({ actorUserId: u.id, action: `COURSE_NOTE_${kind}`, entityType: "Course", entityId: courseId });
}

// ---- Loop 6: course packages adopted by several universities go to HEC's curriculum review committee.
export async function reviewCandidates(threshold: number) {
  const [pcs, reviews] = await Promise.all([
    prisma.publicCourse.findMany({ where: { status: "PUBLIC", importCount: { gte: threshold } }, orderBy: { importCount: "desc" }, take: 100, select: { id: true, code: true, title: true, importCount: true, instituteName: true, version: true } }),
    (db.nationalReview?.findMany({ where: { refKind: "PUBLIC_COURSE" } }).catch(() => null) ?? null) as Promise<{ refId: string; status: string; decision: string | null; decidedAt: Date | null }[] | null>,
  ]);
  return { pcs, reviews };
}
export async function sendToReview(u: U, publicCourseId: string) {
  const pc = await prisma.publicCourse.findUnique({ where: { id: publicCourseId }, select: { code: true, title: true, importCount: true } }); if (!pc) throw new Error("Not found.");
  await db.nationalReview.upsert({ where: { refKind_refId: { refKind: "PUBLIC_COURSE", refId: publicCourseId } }, create: { id: randomUUID(), refKind: "PUBLIC_COURSE", refId: publicCourseId, title: `${pc.code} ${pc.title}`, adoptions: pc.importCount }, update: { adoptions: pc.importCount, status: "OPEN" } });
  await writeAuditLog({ actorUserId: u.id, action: "NATIONAL_REVIEW_OPENED", entityType: "PublicCourse", entityId: publicCourseId });
}
export async function decideReview(u: U, publicCourseId: string, accept: boolean, decision: string) {
  await db.nationalReview.update({ where: { refKind_refId: { refKind: "PUBLIC_COURSE", refId: publicCourseId } }, data: { status: accept ? "ACCEPTED" : "DECLINED", decision: decision.slice(0, 2000), decidedById: u.id, decidedAt: new Date() } });
  const pc = await prisma.publicCourse.findUnique({ where: { id: publicCourseId }, select: { authorId: true, code: true } });
  if (pc) await notifyUsers([pc.authorId], { kind: "INFO", title: `${pc.code}: HEC review ${accept ? "accepted — to be taken into the national curriculum" : "decided"}`, body: decision.slice(0, 200) });
  await writeAuditLog({ actorUserId: u.id, action: accept ? "NATIONAL_REVIEW_ACCEPTED" : "NATIONAL_REVIEW_DECLINED", entityType: "PublicCourse", entityId: publicCourseId });
}

// ---- Labs in lockstep: the lead teacher sends the week's lab to every offering's lab engineer at once.
export async function labOfferings(chairmanId: string, code: string) {
  return prisma.course.findMany({ where: { code, isOffered: true, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, instructorId: true, labEngineerId: true, labEngineer: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
}
export async function broadcastLab(u: U, chairmanId: string, code: string, week: number, instructions: string, rubric: string) {
  const offs = await labOfferings(chairmanId, code);
  if (!offs.some((o) => o.instructorId === u.id) && u.role !== "CHAIRMAN") throw new Error("Only a teacher of this lab course sends its weekly lab.");
  if (!instructions.trim()) throw new Error("Write the week's instructions.");
  const id = randomUUID();
  await db.labBroadcast.create({ data: { id, chairmanId, courseCode: code, week, instructions: instructions.slice(0, 6000), rubric: rubric.slice(0, 3000) || null, sentById: u.id } });
  await notifyUsers(offs.map((o) => o.labEngineerId).concat(offs.map((o) => o.instructorId)).filter((x) => x && x !== u.id), { kind: "ASSIGNMENT", title: `${code} lab, week ${week}: instructions from ${u.name}`, href: "/lab-broadcast" });
  return id;
}
export async function ackLab(u: U, broadcastId: string, courseId: string, note: string) {
  await db.labBroadcastAck.upsert({ where: { broadcastId_userId: { broadcastId, userId: u.id } }, create: { broadcastId, userId: u.id, courseId, note: note.slice(0, 500) || null }, update: { courseId, note: note.slice(0, 500) || null, at: new Date() } });
}
export async function broadcastsFor(chairmanId: string, codes: string[]) {
  const rows = ((await db.labBroadcast?.findMany({ where: { chairmanId, courseCode: { in: codes.concat("none") } }, orderBy: { at: "desc" }, take: 60 }).catch(() => null)) ?? null) as { id: string; courseCode: string; week: number; instructions: string; rubric: string | null; sentById: string; at: Date }[] | null;
  if (!rows) return null;
  const acks = ((await db.labBroadcastAck.findMany({ where: { broadcastId: { in: rows.map((r) => r.id).concat("none") } } })) as { broadcastId: string; userId: string; courseId: string; note: string | null; at: Date }[]);
  return rows.map((r) => ({ ...r, acks: acks.filter((a) => a.broadcastId === r.id) }));
}
