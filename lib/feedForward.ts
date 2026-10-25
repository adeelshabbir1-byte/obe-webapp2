import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { previousOfferings } from "./courseHistory";

// Feed-forward notes left on earlier offerings of a course, shown on this offering's pages, and the teacher's / SE's
// check-ins on them: at the start, at midterm and at the end — Read → Applied / Partly applied / Not applied + comment.
export const fdb = prisma as unknown as Record<string, any>;
export const CHECKPOINTS = [["START", "Start of semester"], ["MID", "Midterm"], ["END", "End of semester"]] as const;
export const ACK = [["READ", "Read"], ["APPLIED", "Applied"], ["PARTLY", "Partly applied"], ["NOT_APPLIED", "Not applied"]] as const;
export type Ack = { id: string; noteId: string; courseId: string; userId: string; checkpoint: string; status: string; comment: string | null; at: Date };

export async function notesFor(courseId: string) {
  const prev = (await previousOfferings(courseId)).map((p) => p.id);
  const notes = await prisma.feedForwardNote.findMany({ where: { courseId: { in: prev.concat("none") } }, include: { course: { select: { code: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } } } }, orderBy: { createdAt: "desc" }, take: 40 });
  const acks = ((await fdb.feedForwardAck.findMany({ where: { courseId } }).catch(() => [])) as Ack[]);
  const authors = await prisma.user.findMany({ where: { id: { in: notes.map((n) => n.authorId).concat("none") } }, select: { id: true, name: true } });
  return notes.map((n) => ({ ...n, author: authors.find((a) => a.id === n.authorId)?.name || "", acks: acks.filter((a) => a.noteId === n.id) }));
}
/** The checkpoint this person still owes on this course (null when done or nothing to read). */
export async function pendingCheckpoint(courseId: string, userId: string) {
  const ns = await notesFor(courseId);
  if (!ns.length) return null;
  for (const [cp] of CHECKPOINTS) if (ns.some((n) => !n.acks.some((a) => a.userId === userId && a.checkpoint === cp))) return cp;
  return null;
}
export async function startReadDone(courseId: string, userId: string) {
  const ns = await notesFor(courseId);
  return ns.every((n) => n.acks.some((a) => a.userId === userId && a.checkpoint === "START"));
}
export async function acknowledge(user: { id: string }, courseId: string, noteId: string, checkpoint: string, status: string, comment: string) {
  const c = await prisma.course.findFirst({ where: { id: courseId, OR: [{ instructorId: user.id }, { subjectExpertId: user.id }, { labEngineerId: user.id }] }, select: { id: true } });
  if (!c) throw new Error("Only this course's teacher or Subject Expert checks in on its notes.");
  if (!CHECKPOINTS.some(([k]) => k === checkpoint) || !ACK.some(([k]) => k === status)) throw new Error("Choose the check-in and a status.");
  if (status !== "READ" && comment.trim().length < 3) throw new Error("Add a comment: how you applied it, or why not.");
  const ex = (await fdb.feedForwardAck.findFirst({ where: { noteId, courseId, userId: user.id, checkpoint } })) as Ack | null;
  if (ex) await fdb.feedForwardAck.update({ where: { id: ex.id }, data: { status, comment: comment.trim() || null, at: new Date() } });
  else await fdb.feedForwardAck.create({ data: { id: crypto.randomUUID(), noteId, courseId, userId: user.id, checkpoint, status, comment: comment.trim() || null } });
  await writeAuditLog({ actorUserId: user.id, action: "FEEDFORWARD_ACK", entityType: "Course", entityId: courseId, metadata: { noteId, checkpoint, status } });
  return "Saved.";
}
