import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { cleanScores, summary } from "./observationCore";

const db = prisma as unknown as Record<string, any>;
export const OBS_HINT = "Run prisma/migration_adeel_p11.sql in Supabase first.";
type U = { id: string; role: string; name: string; managedById?: string | null };
const MANAGERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC"];
export type Obs = { id: string; chairmanId: string; courseId: string; teacherId: string; observerId: string; lectureNumber: number | null; observedOn: Date; plannedTopic: string | null; taughtTopic: string | null; scoresJson: string; strengths: string | null; improve: string | null; status: string; teacherReply: string | null; createdAt: Date };

/** Courses this term with their teachers, for the observer's form. */
export async function coursesToObserve(u: U) {
  const cid = await chairmanIdFor(u as never);
  const cs = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: cid }, instructorId: { not: null } }, orderBy: { code: "asc" }, take: 400, select: { id: true, code: true, title: true, instructorId: true, instructor: { select: { name: true } }, batch: { select: { batchName: true } } } });
  return cs.filter((c) => c.instructorId !== u.id).map((c) => ({ id: c.id, label: `${c.code} ${c.title} — ${c.instructor?.name || ""}${c.batch ? ` (${c.batch.batchName})` : ""}` }));
}
export async function plannedTopic(courseId: string, n: number) {
  const r = await prisma.lectureRow.findFirst({ where: { courseId, lectureNumber: n, source: "INSTRUCTOR" }, select: { topic: true } }) || await prisma.lectureRow.findFirst({ where: { courseId, lectureNumber: n }, select: { topic: true } });
  return r?.topic || null;
}
export async function record(u: U, b: { courseId: string; lectureNumber?: number; observedOn?: string; taughtTopic?: string; scores?: unknown; strengths?: string; improve?: string; cqi?: boolean }) {
  if (!db.classObservation) throw new Error(OBS_HINT);
  const cid = await chairmanIdFor(u as never);
  const c = await prisma.course.findUnique({ where: { id: String(b.courseId) }, select: { id: true, code: true, instructorId: true, batchId: true, coordinator: { select: { managedById: true } } } });
  if (!c || c.coordinator.managedById !== cid || !c.instructorId) throw new Error("Course not found.");
  if (c.instructorId === u.id) throw new Error("You can't observe your own class.");
  const n = Number(b.lectureNumber) || null;
  const planned = n ? await plannedTopic(c.id, n) : null;
  const scores = cleanScores(b.scores);
  if (!Object.keys(scores).length) throw new Error("Rate at least one area.");
  const id = randomUUID();
  await db.classObservation.create({ data: { id, chairmanId: cid, courseId: c.id, teacherId: c.instructorId, observerId: u.id, lectureNumber: n, observedOn: b.observedOn ? new Date(String(b.observedOn)) : new Date(), plannedTopic: planned, taughtTopic: String(b.taughtTopic || "").slice(0, 300) || null, scoresJson: JSON.stringify(scores), strengths: String(b.strengths || "").slice(0, 2000) || null, improve: String(b.improve || "").slice(0, 2000) || null } });
  const s = summary(scores, planned, String(b.taughtTopic || "") || null);
  if (b.cqi && (s.weak.length || String(b.improve || "").trim())) {
    await prisma.cqiRecord.create({ data: { chairmanId: cid, authorId: u.id, lastUpdatedById: u.id, batchId: c.batchId, courseId: c.id, sourceType: "GENERAL", sourceReference: "Classroom observation", status: "open", finding: `Classroom observation of ${c.code}${n ? ` (L${n})` : ""}: ${s.weak.join("; ") || "areas to improve"}.`, actionTaken: String(b.improve || "").slice(0, 1000) || null } as never }).catch(() => null);
  }
  await notifyUsers([c.instructorId], { kind: "OBSERVATION", title: `${u.name} shared a classroom observation of ${c.code}`, body: "Read it and add your reply.", href: "/observations" }).catch(() => null);
  await writeAuditLog({ actorUserId: u.id, action: "CLASS_OBSERVATION_RECORDED", entityType: "Course", entityId: c.id, metadata: { teacherId: c.instructorId, avg: s.avg } });
  return { id, ...s };
}
export async function reply(u: U, id: string, text: string) {
  const o = (await db.classObservation?.findUnique({ where: { id } }).catch(() => null)) as Obs | null;
  if (!o || o.teacherId !== u.id) throw new Error("Not found.");
  await db.classObservation.update({ where: { id }, data: { teacherReply: text.slice(0, 2000), status: "REPLIED" } });
  await notifyUsers([o.observerId], { kind: "OBSERVATION", title: "The teacher replied to your observation", href: "/observations" }).catch(() => null);
  return { ok: true };
}
/** What this person may see: managers all of the institute; others their own (as observer or teacher). */
export async function visible(u: U) {
  if (!db.classObservation) return { rows: [] as (Obs & { course: string; teacher: string; observer: string })[], manager: false };
  const cid = await chairmanIdFor(u as never);
  const manager = MANAGERS.includes(u.role);
  const rows = (await db.classObservation.findMany({ where: manager ? { chairmanId: cid } : { chairmanId: cid, OR: [{ teacherId: u.id }, { observerId: u.id }] }, orderBy: { observedOn: "desc" }, take: 200 }).catch(() => [])) as Obs[];
  const [cs, us] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat("none") } }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.teacherId, r.observerId]).concat("none") } }, select: { id: true, name: true } }),
  ]);
  const cn = new Map(cs.map((c) => [c.id, c.code])), un = new Map(us.map((x) => [x.id, x.name]));
  return { manager, rows: rows.map((r) => ({ ...r, course: cn.get(r.courseId) || "", teacher: un.get(r.teacherId) || "", observer: un.get(r.observerId) || "" })) };
}
