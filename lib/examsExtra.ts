import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { layoutSeats, type Layout, type Pref } from "./examDutiesCore";

// Queue item 17: the Controller's exam set-up kept per session (ExamSessionExtra), each teacher's duty preferences
// (ExamDutyOpt), and the day-of-exam log (check-in, chain of custody, unfair means, replacements).
const db = prisma as unknown as Record<string, any>;
export const EXTRA_HINT = "Run prisma/migration_adeel_p13.sql (System Health → database updates) first.";
export type Extra = {
  rooms?: Record<string, { use?: boolean; female?: boolean; building?: string } & Partial<Layout>>; extraRooms?: ({ id: string; name: string; female?: boolean; building?: string } & Layout)[];
  durations?: { Midterm?: number; Final?: number; other?: number; courses?: Record<string, number> };
  allowCoreCore?: boolean; perStudents?: number; reservePerRooms?: number; superintendent?: boolean;
  reduced?: Record<string, { quota: number; reason: string }>; official?: Record<string, { dates: string[]; reason: string }>;
  rate?: number; reportMinutes?: number; costShares?: { name: string; pct: number }[]; otherCosts?: number; lastBent?: { key: string; why: string }[]; slotStaff?: Record<string, Record<string, string[]>>;
};
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
export async function extraOf(sessionId: string): Promise<Extra> {
  const r = (await db.examSessionExtra?.findUnique({ where: { sessionId } }).catch(() => null)) as { json: string } | null;
  return J<Extra>(r?.json, {});
}
export async function saveExtra(sessionId: string, patch: Extra) {
  const cur = await extraOf(sessionId); const json = JSON.stringify({ ...cur, ...patch });
  await db.examSessionExtra.upsert({ where: { sessionId }, create: { sessionId, json }, update: { json, updatedAt: new Date() } });
}
/** Seats of a room in this session: rows × seats per row (less blocked seats) when the Controller set a layout. */
export function seatsOf(room: { id: string; capacity: number }, seatPercent: number, e: Extra) {
  const o = e.rooms?.[room.id];
  if (o?.rows && o.cols) return layoutSeats({ rows: o.rows, cols: o.cols, blocked: o.blocked || 0 });
  return Math.floor((room.capacity * seatPercent) / 100);
}
export async function optsOf(sessionId: string) {
  const rows = ((await db.examDutyOpt?.findMany({ where: { sessionId } }).catch(() => [])) || []) as { userId: string; json: string }[];
  return new Map(rows.map((r) => [r.userId, J<Pref>(r.json, {})]));
}
export async function saveOpts(sessionId: string, userId: string, p: Pref) {
  const clean: Pref = {
    days: (p.days || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60), unavailable: (p.unavailable || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60),
    maxDays: Math.max(0, Math.min(30, Number(p.maxDays) || 0)), perDay: Math.max(1, Math.min(4, Number(p.perDay) || 1)), time: p.time === "LAST" || p.time === "MORNING" ? p.time : "ANY",
  };
  const json = JSON.stringify(clean);
  await db.examDutyOpt.upsert({ where: { sessionId_userId: { sessionId, userId } }, create: { sessionId, userId, json }, update: { json } });
}
/** Duties each person did in the institute's other sessions of the last year (fair load over the year). */
export async function dutyHistory(chairmanId: string, exceptSessionId: string) {
  const ss = (await db.examSession.findMany({ where: { chairmanId, id: { not: exceptSessionId }, startDate: { gte: new Date(Date.now() - 365 * 864e5) } }, select: { id: true } })) as { id: string }[];
  const papers = ss.length ? ((await db.examPaper.findMany({ where: { sessionId: { in: ss.map((x) => x.id) } }, select: { invigilatorsJson: true } })) as { invigilatorsJson: string }[]) : [];
  const m = new Map<string, number>();
  for (const p of papers) for (const r of J<{ userIds: string[] }[]>(p.invigilatorsJson, [])) for (const u of r.userIds) m.set(u, (m.get(u) || 0) + 1);
  return m;
}
/** Teachers whose own class is timetabled at an exam slot's time (mid-terms during teaching weeks). */
export async function classClash(chairmanId: string, userIds: string[]) {
  const run = (await prisma.timetableRun.findFirst({ where: { chairmanId, status: "COMPLETED" } as never, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null)) as { id: string } | null;
  if (!run || !userIds.length) return (_u: string, _date: string, _slot: string) => false;
  const es = await prisma.timetableEntry.findMany({ where: { timetableRunId: run.id, scheduleSection: { instructorId: { in: userIds } } }, select: { dayOfWeek: true, startHour: true, scheduleSection: { select: { instructorId: true, sessionDurationMinutes: true } } } }).catch(() => []);
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (u: string, date: string, slot: string) => {
    const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(slot); if (!m) return false;
    const a = +m[1] + +m[2] / 60, b = +m[3] + +m[4] / 60; const wd = WD[new Date(`${date}T00:00:00Z`).getUTCDay()];
    return es.some((e) => e.scheduleSection.instructorId === u && e.dayOfWeek === wd && e.startHour < b && e.startHour + (e.scheduleSection.sessionDurationMinutes || 60) / 60 > a);
  };
}

// ---- On the day and after ----
export type LogKind = "CHECKIN" | "CUSTODY" | "UFM" | "REPLACE";
export async function logRoom(sessionId: string, slotKey: string, roomId: string, kind: LogKind, userId: string, data: Record<string, unknown>) {
  await db.examRoomLog.create({ data: { id: randomUUID(), sessionId, slotKey, roomId, kind, userId, dataJson: JSON.stringify(data).slice(0, 8000) } });
}
export async function logsOf(sessionId: string) {
  return ((await db.examRoomLog?.findMany({ where: { sessionId }, orderBy: { at: "asc" } }).catch(() => null)) || null) as { slotKey: string; roomId: string; kind: LogKind; userId: string; dataJson: string; at: Date }[] | null;
}
/** Emergency replacement from the reserves: one person's duty in a room goes to another; both are told. */
export async function replaceDuty(actor: { id: string }, sessionId: string, slotKey: string, roomId: string, fromId: string, toId: string) {
  const [date, slot] = slotKey.split(":");
  const papers = (await db.examPaper.findMany({ where: { sessionId, slot: Number(slot) } })) as { id: string; date: Date | null; invigilatorsJson: string }[];
  let n = 0;
  for (const p of papers.filter((x) => x.date && x.date.toISOString().slice(0, 10) === date)) {
    const inv = J<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, []);
    let hit = false; for (const r of inv) if (r.roomId === roomId && r.userIds.includes(fromId)) { r.userIds = r.userIds.map((u) => (u === fromId ? toId : u)); hit = true; }
    if (hit) { await db.examPaper.update({ where: { id: p.id }, data: { invigilatorsJson: JSON.stringify(inv) } }); n++; }
  }
  if (!n) throw new Error("That person has no duty in that room at that time.");
  await logRoom(sessionId, slotKey, roomId, "REPLACE", actor.id, { fromId, toId });
  await notifyUsers([fromId, toId], { kind: "ASSIGNMENT", title: "Exam duty changed", body: `Duty on ${date}, slot ${Number(slot) + 1}: replaced by the exam branch.`, href: `/exams/${sessionId}/my-duties` });
  await writeAuditLog({ actorUserId: actor.id, action: "EXAM_DUTY_REPLACED", entityType: "ExamSession", entityId: sessionId, metadata: { slotKey, roomId, fromId, toId } });
}
/** Duties done, late and missed per person, and the allowance at the session's rate (for finance). */
export async function allowance(sessionId: string) {
  const [papers, logs, e] = await Promise.all([db.examPaper.findMany({ where: { sessionId } }) as Promise<{ date: Date | null; slot: number | null; invigilatorsJson: string }[]>, logsOf(sessionId), extraOf(sessionId)]);
  const per = new Map<string, { duties: number; checked: number; late: number }>();
  const seen = new Set<string>();
  for (const p of papers) if (p.date && p.slot !== null) for (const r of J<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, [])) for (const u of r.userIds) {
    const k = `${u}|${p.date.toISOString().slice(0, 10)}:${p.slot}|${r.roomId}`; if (seen.has(k)) continue; seen.add(k);
    const x = per.get(u) || { duties: 0, checked: 0, late: 0 }; x.duties++; per.set(u, x);
  }
  for (const [slotKey, staff] of Object.entries(e.slotStaff || {})) for (const [roomId, ids] of Object.entries(staff)) for (const u of ids) { const k = `${u}|${slotKey}|${roomId}`; if (seen.has(k)) continue; seen.add(k); const x = per.get(u) || { duties: 0, checked: 0, late: 0 }; x.duties++; per.set(u, x); }
  for (const l of logs || []) if (l.kind === "CHECKIN") { const x = per.get(l.userId); if (x) { x.checked++; if (J<{ late?: boolean }>(l.dataJson, {}).late) x.late++; } }
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(per.keys()) } }, select: { id: true, name: true } });
  return users.map((u) => { const x = per.get(u.id)!; return { id: u.id, name: u.name, ...x, missed: Math.max(0, x.duties - x.checked), amount: (e.rate || 0) * x.checked }; }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Daily: a reminder the day before each duty (item 17). */
export async function dutyReminders() {
  const t = new Date(Date.now() + 5 * 3600e3); t.setUTCDate(t.getUTCDate() + 1); const day = t.toISOString().slice(0, 10);
  const from = new Date(`${day}T00:00:00Z`), to = new Date(`${day}T23:59:59Z`);
  const ss = (await db.examSession.findMany({ where: { status: "PUBLISHED", startDate: { lte: to }, endDate: { gte: from } }, select: { id: true, name: true, slotsJson: true } }).catch(() => [])) as { id: string; name: string; slotsJson: string }[];
  let n = 0;
  for (const s of ss) {
    const papers = (await db.examPaper.findMany({ where: { sessionId: s.id, date: { gte: from, lte: to } }, select: { slot: true, invigilatorsJson: true } })) as { slot: number | null; invigilatorsJson: string }[];
    const per = new Map<string, Set<number>>();
    for (const p of papers) for (const r of J<{ userIds: string[] }[]>(p.invigilatorsJson, [])) for (const u of r.userIds) per.set(u, new Set([...(per.get(u) || []), p.slot ?? 0]));
    const times = J<string[]>(s.slotsJson, []);
    for (const [u, sl] of Array.from(per.entries())) { await notifyUsers([u], { kind: "ASSIGNMENT", title: `${s.name}: exam duty tomorrow`, body: Array.from(sl).sort().map((x) => times[x] || `slot ${x + 1}`).join(", "), href: `/exams/${s.id}/my-duties` }).catch(() => null); n++; }
  }
  return n;
}
