import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { teacherRatings } from "./evaluations";

// Faculty Development Program: the year's sessions, who attended (with a certificate), hours against the yearly
// target (sessions here plus hours a teacher earned outside), and suggestions for what to run next — from CLOs that
// keep missing their target (open CQI records) and from low student ratings.

const fdb = prisma as unknown as Record<string, any>;
export const FDP_HINT = "The Faculty Development Program needs prisma/migration_campus_ops.sql — run it in Supabase.";
export const FDP_KINDS: Record<string, string> = { WORKSHOP: "Workshop", SEMINAR: "Seminar", TRAINING: "Training course", ONLINE: "Online course", CONFERENCE: "Conference", PEER: "Peer observation" };
export type Session = { id: string; chairmanId: string; title: string; kind: string; topic: string | null; date: Date; hours: number; facilitator: string | null; venue: string | null; audience: string | null; reason: string | null; status: string };
export type Att = { id: string; sessionId: string; userId: string; attended: boolean; certificateNo: string | null };
export type Ext = { id: string; userId: string; title: string; organizer: string | null; date: Date; hours: number };

const yr = (y: number) => ({ gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) });

export async function target(chairmanId: string) {
  try { return ((await fdb.fdpTarget.findUnique({ where: { chairmanId } })) as { hoursPerYear: number } | null)?.hoursPerYear ?? 20; } catch { return 20; }
}
export async function setTarget(chairmanId: string, hours: number) {
  await fdb.fdpTarget.upsert({ where: { chairmanId }, create: { id: randomUUID(), chairmanId, hoursPerYear: hours, updatedAt: new Date() }, update: { hoursPerYear: hours, updatedAt: new Date() } });
}

export async function yearData(chairmanId: string, year: number) {
  const sessions = (await fdb.fdpSession.findMany({ where: { chairmanId, date: yr(year) }, orderBy: { date: "asc" } })) as Session[];
  const att = (await fdb.fdpAttendance.findMany({ where: { sessionId: { in: sessions.map((s) => s.id).concat("none") } } })) as Att[];
  const ext = (await fdb.fdpExternal.findMany({ where: { chairmanId, date: yr(year) }, orderBy: { date: "asc" } })) as Ext[];
  return { sessions, att, ext };
}

/** Hours per teacher in the year: sessions attended here + outside hours. */
export function hoursBy(d: Awaited<ReturnType<typeof yearData>>) {
  const h = new Map<string, { internal: number; external: number }>();
  const sOf = new Map(d.sessions.map((s) => [s.id, s]));
  for (const a of d.att) if (a.attended && sOf.get(a.sessionId)?.status === "HELD") { const x = h.get(a.userId) || { internal: 0, external: 0 }; x.internal += sOf.get(a.sessionId)!.hours; h.set(a.userId, x); }
  for (const e of d.ext) { const x = h.get(e.userId) || { internal: 0, external: 0 }; x.external += e.hours; h.set(e.userId, x); }
  return h;
}

/** FDP hours of some teachers in a year (for the performance report). */
export async function fdpHours(chairmanId: string, userIds: string[], year: number) {
  try { const h = hoursBy(await yearData(chairmanId, year)); return new Map(userIds.map((u) => [u, (h.get(u)?.internal || 0) + (h.get(u)?.external || 0)])); } catch { return new Map<string, number>(); }
}

export async function saveSession(chairmanId: string, d: Omit<Session, "id" | "chairmanId"> & { id?: string }, by: string) {
  if (d.id) { await fdb.fdpSession.updateMany({ where: { id: d.id, chairmanId }, data: { ...d, id: undefined } }); return d.id; }
  const id = randomUUID();
  await fdb.fdpSession.create({ data: { id, chairmanId, ...d, createdById: by, createdAt: new Date() } });
  return id;
}

/** Mark who attended (the rest of the invited list is cleared); attendance of a held session gets a certificate number. */
export async function markAttendance(chairmanId: string, sessionId: string, userIds: string[]) {
  const s = (await fdb.fdpSession.findFirst({ where: { id: sessionId, chairmanId } })) as Session | null;
  if (!s) throw new Error("Not found.");
  await fdb.fdpAttendance.deleteMany({ where: { sessionId, userId: { notIn: userIds.concat("none") } } });
  const have = new Set(((await fdb.fdpAttendance.findMany({ where: { sessionId } })) as Att[]).map((a) => a.userId));
  const y = s.date.getUTCFullYear();
  let n = await fdb.fdpAttendance.count({ where: { certificateNo: { startsWith: `FDP-${y}-` } } });
  for (const u of userIds) if (!have.has(u)) { n++; await fdb.fdpAttendance.create({ data: { id: randomUUID(), sessionId, userId: u, attended: true, certificateNo: `FDP-${y}-${String(n).padStart(4, "0")}`, createdAt: new Date() } }); }
  if (s.status !== "HELD") await fdb.fdpSession.update({ where: { id: sessionId }, data: { status: "HELD" } });
  await notifyUsers(userIds.filter((u) => !have.has(u)), { kind: "FDP", title: `FDP certificate: ${s.title}`, body: `${s.hours} hour(s) added to your development record.`, href: "/fdp" });
}

export async function addExternal(chairmanId: string, userId: string, d: { title: string; organizer: string | null; date: Date; hours: number }) {
  await fdb.fdpExternal.create({ data: { id: randomUUID(), chairmanId, userId, ...d, createdAt: new Date() } });
}

/** What to run next: open CQI records on CLOs, low student ratings, and teachers far from the target. */
export async function suggestions(chairmanId: string, people: { id: string; name: string }[], year: number) {
  const out: { topic: string; why: string; who: string[] }[] = [];
  const ids = people.map((p) => p.id);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const cqi = await prisma.cqiRecord.findMany({ where: { chairmanId, sourceType: "CLO", status: { in: ["open", "in-progress"] } }, select: { courseId: true, sourceReference: true, course: { select: { code: true, instructorId: true, subjectExpertId: true } } }, take: 200 }).catch(() => []);
  if (cqi.length) {
    const who = Array.from(new Set(cqi.flatMap((c) => [c.course?.instructorId, c.course?.subjectExpertId]).filter((x): x is string => !!x && name.has(x))));
    out.push({ topic: "Assessment design and CLO attainment (aligning questions, rubrics and teaching to CLOs)", why: `${cqi.length} CLO(s) missed the target two offerings in a row: ${Array.from(new Set(cqi.map((c) => `${c.course?.code} ${c.sourceReference}`))).slice(0, 8).join(", ")}`, who: who.map((w) => name.get(w)!) });
  }
  const offered = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: { in: ids.concat("none") } }, { sectionAssignments: { some: { instructorId: { in: ids.concat("none") } } } }] }, select: { id: true } });
  const r = await teacherRatings(offered.map((c) => c.id)).catch(() => new Map());
  const low = new Map<string, number[]>();
  for (const xs of Array.from(r.values())) for (const x of xs as { teacherId: string; overall: number | null }[]) if (x.overall !== null && name.has(x.teacherId)) low.set(x.teacherId, [...(low.get(x.teacherId) || []), x.overall]);
  const weak = Array.from(low.entries()).filter(([, v]) => v.reduce((a, b) => a + b, 0) / v.length < 3.5).map(([k]) => name.get(k)!);
  if (weak.length) out.push({ topic: "Effective teaching and classroom engagement (active learning, feedback to students)", why: "Students rated these teachers under 3.5/5 this term.", who: weak });
  const t = await target(chairmanId);
  const h = hoursBy(await yearData(chairmanId, year));
  const behind = people.filter((p) => ((h.get(p.id)?.internal || 0) + (h.get(p.id)?.external || 0)) < t / 2).map((p) => p.name);
  if (behind.length && new Date().getUTCMonth() >= 5) out.push({ topic: "Any FDP session — catch-up on hours", why: `Under half of the ${t}-hour yearly target.`, who: behind });
  out.push({ topic: "OBE refresher: writing CLOs, mapping to PLOs, using OBEHUB results", why: "Recommended once a year for every teacher (accreditation councils ask for it).", who: [] });
  return out;
}
