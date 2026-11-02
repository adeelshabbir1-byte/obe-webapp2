import { randomUUID } from "crypto";
import { prisma } from "./db";
import { courseCtx, isReviewer } from "./qbank";
import { writeAuditLog } from "./audit";

// Learning resources per lecture topic (queue item 8.7): the SE, the course's teachers or the Program Lead link open
// resources (videos, readings, library books) to each topic of the plan. Students see the ones for a CLO they have not
// cleared yet, beside the practice questions. Kept per course code, so every section and batch shares them.
const db = prisma as unknown as Record<string, any>;
export const RES_HINT = "Run prisma/migration_adeel_p11.sql in Supabase first.";
export const KINDS: Record<string, string> = { VIDEO: "Video", READING: "Reading", BOOK: "Library book", LINK: "Web page", EXERCISE: "Exercise" };
export type Res = { id: string; lectureNumber: number; title: string; url: string | null; kind: string; note: string | null; addedById: string };

async function lecturesOf(courseId: string) {
  const own = await prisma.lectureRow.count({ where: { courseId, source: "SE" } });
  return prisma.lectureRow.findMany({ where: { courseId, source: own ? "SE" : "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, clo: { select: { code: true } } } });
}
async function listFor(chairmanId: string, codes: string[]): Promise<Res[]> {
  return ((await db.topicResource?.findMany({ where: { chairmanId, courseCode: { in: codes } }, orderBy: [{ lectureNumber: "asc" }, { createdAt: "asc" }] }).catch(() => [])) || []) as Res[];
}
/** The staff page: every lecture of the plan with its resources; who may edit. */
export async function staffView(u: { id: string; role: string }, courseId: string) {
  const ctx = await courseCtx(courseId);
  const may = ctx.teacherIds.includes(u.id) || isReviewer(ctx, u as never);
  if (!may) throw new Error("forbidden");
  const [lecs, res] = await Promise.all([lecturesOf(ctx.baseId), listFor(ctx.chairmanId, ctx.codes.map(String))]);
  return { course: { id: courseId, code: ctx.course.code, title: ctx.course.title }, lectures: lecs.map((l) => ({ n: l.lectureNumber, topic: l.topic, clo: l.clo?.code || null, res: res.filter((r) => r.lectureNumber === l.lectureNumber) })) };
}
export async function addRes(u: { id: string; role: string }, courseId: string, b: { lectureNumber: number; title: string; url?: string; kind?: string; note?: string }) {
  if (!db.topicResource) throw new Error(RES_HINT);
  const ctx = await courseCtx(courseId);
  if (!(ctx.teacherIds.includes(u.id) || isReviewer(ctx, u as never))) throw new Error("forbidden");
  const title = String(b.title || "").trim().slice(0, 200); if (!title) throw new Error("Give the resource a title.");
  const url = String(b.url || "").trim().slice(0, 500);
  if (url && !/^https?:\/\//i.test(url)) throw new Error("The link must start with http:// or https://.");
  const id = randomUUID();
  await db.topicResource.create({ data: { id, chairmanId: ctx.chairmanId, courseCode: ctx.course.code, lectureNumber: Math.max(1, Number(b.lectureNumber) || 1), title, url: url || null, kind: KINDS[String(b.kind)] ? String(b.kind) : "LINK", note: String(b.note || "").slice(0, 300) || null, addedById: u.id } });
  await writeAuditLog({ actorUserId: u.id, action: "TOPIC_RESOURCE_ADDED", entityType: "Course", entityId: courseId, metadata: { lecture: b.lectureNumber, title } });
  return { id };
}
export async function removeRes(u: { id: string; role: string }, courseId: string, id: string) {
  const ctx = await courseCtx(courseId);
  if (!(ctx.teacherIds.includes(u.id) || isReviewer(ctx, u as never))) throw new Error("forbidden");
  await db.topicResource?.deleteMany({ where: { id, chairmanId: ctx.chairmanId } });
  return { ok: true };
}
/** For a student: resources of the lectures that teach a CLO (or all, without a CLO). */
export async function forStudent(courseId: string, clo = "") {
  const ctx = await courseCtx(courseId);
  const [lecs, res] = await Promise.all([lecturesOf(ctx.baseId), listFor(ctx.chairmanId, ctx.codes.map(String))]);
  const want = new Set<number>(lecs.filter((l) => !clo || l.clo?.code === clo).map((l) => l.lectureNumber as number));
  const topic = new Map<number, string>(lecs.map((l) => [l.lectureNumber as number, l.topic as string]));
  return res.filter((r) => want.has(r.lectureNumber)).map((r) => ({ ...r, topic: topic.get(r.lectureNumber) || "" }));
}
/** How many resources each CLO has (for My CLOs). */
export async function resourceCounts(courseId: string): Promise<Record<string, number>> {
  try {
    const ctx = await courseCtx(courseId);
    const [lecs, res] = await Promise.all([lecturesOf(ctx.baseId), listFor(ctx.chairmanId, ctx.codes.map(String))]);
    const cloOf = new Map<number, string>(lecs.map((l) => [l.lectureNumber as number, (l.clo?.code || "") as string]));
    const out: Record<string, number> = {};
    for (const r of res) { const c = cloOf.get(r.lectureNumber); if (c) out[c] = (out[c] || 0) + 1; }
    return out;
  } catch { return {}; }
}
