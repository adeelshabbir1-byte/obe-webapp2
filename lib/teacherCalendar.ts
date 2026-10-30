import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { notifyUsers } from "./notifications";
import { notifyStudents } from "./studentNotices";
import { externalBusy } from "./calendarLink";
import {
  DAY_NAMES, DEFAULT_SETTINGS, addDays, at, expandWeekly, forViewer, freeSlots, localDay, whenText,
  type Item, type Privacy, type Settings,
} from "./calendarCore";

// A teacher's calendar: the weekly classes from the current timetable, counselling hours, their own blocks, a linked
// Google / Outlook calendar (busy only) and appointments. Others see only free slots and, where the teacher allows,
// what a busy time is; they ask for an appointment with a reason, and the teacher accepts or declines.

const db = prisma as unknown as Record<string, any>;
export const CAL_HINT = "Run prisma/migration_prompt10b.sql in Supabase first.";
export type Block = { id: string; userId: string; dayOfWeek: number | null; date: string | null; startMin: number; endMin: number; label: string; privacy: Privacy };
export type Appt = { id: string; chairmanId: string | null; teacherId: string; requesterKind: "STUDENT" | "STAFF"; requesterId: string; requesterName: string; startsAt: Date; endsAt: Date; reason: string; status: string; note: string | null; decidedAt: Date | null; createdAt: Date };
const P = (s: unknown): Privacy => (s === "DETAILS" ? "DETAILS" : "BUSY");

export async function settingsOf(userId: string): Promise<Settings> {
  const r = await db.appointmentSetting.findUnique({ where: { userId } }).catch(() => null);
  if (!r) return { ...DEFAULT_SETTINGS };
  let days: number[] = DEFAULT_SETTINGS.days;
  try { days = (JSON.parse(r.daysJson) as number[]).filter((d) => d >= 0 && d <= 6); } catch { /* default */ }
  return { slotMinutes: r.slotMinutes, maxPerDay: r.maxPerDay, startMin: r.startMin, endMin: r.endMin, days, classPrivacy: P(r.classPrivacy), counsellingPrivacy: P(r.counsellingPrivacy), open: r.open };
}
export async function saveSettings(userId: string, s: Partial<Settings>) {
  const cur = await settingsOf(userId);
  const n: Settings = {
    slotMinutes: [10, 15, 20, 30, 45, 60, 90].includes(Number(s.slotMinutes)) ? Number(s.slotMinutes) : cur.slotMinutes,
    maxPerDay: Math.max(0, Math.min(20, Math.round(Number(s.maxPerDay ?? cur.maxPerDay)))),
    startMin: Number.isFinite(Number(s.startMin)) ? Number(s.startMin) : cur.startMin,
    endMin: Number.isFinite(Number(s.endMin)) ? Number(s.endMin) : cur.endMin,
    days: Array.isArray(s.days) ? Array.from(new Set(s.days.map(Number).filter((d) => d >= 0 && d <= 6))).sort() : cur.days,
    classPrivacy: s.classPrivacy ? P(s.classPrivacy) : cur.classPrivacy,
    counsellingPrivacy: s.counsellingPrivacy ? P(s.counsellingPrivacy) : cur.counsellingPrivacy,
    open: s.open === undefined ? cur.open : !!s.open,
  };
  if (n.endMin <= n.startMin) throw new Error("Appointment hours must end after they start.");
  const data = { slotMinutes: n.slotMinutes, maxPerDay: n.maxPerDay, startMin: n.startMin, endMin: n.endMin, daysJson: JSON.stringify(n.days), classPrivacy: n.classPrivacy, counsellingPrivacy: n.counsellingPrivacy, open: n.open, updatedAt: new Date() };
  await db.appointmentSetting.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return n;
}

export async function blocksOf(userId: string): Promise<Block[]> {
  return db.teacherBlock.findMany({ where: { userId }, orderBy: [{ dayOfWeek: "asc" }, { date: "asc" }, { startMin: "asc" }] });
}
export async function addBlock(userId: string, b: { dayOfWeek?: number | null; date?: string | null; startMin: number; endMin: number; label: string; privacy: Privacy }) {
  if (!(b.endMin > b.startMin)) throw new Error("The block must end after it starts.");
  const date = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const dow = date ? null : Number.isInteger(b.dayOfWeek) && b.dayOfWeek! >= 0 && b.dayOfWeek! <= 6 ? b.dayOfWeek! : null;
  if (date === null && dow === null) throw new Error("Choose a weekday (repeats weekly) or a date.");
  const row = { id: randomUUID(), userId, dayOfWeek: dow, date, startMin: b.startMin, endMin: b.endMin, label: (b.label || "").trim().slice(0, 120), privacy: P(b.privacy) };
  await db.teacherBlock.create({ data: row });
  return row;
}
export async function deleteBlock(userId: string, id: string) { await db.teacherBlock.deleteMany({ where: { id, userId } }); }

/** The teacher's classes in the latest finished timetable of each scope of their institute. */
async function classRows(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, managedById: true } });
  if (!u) return [];
  const chairmanId = await chairmanIdFor(u).catch(() => "");
  if (!chairmanId) return [];
  const runs = await prisma.timetableRun.findMany({ where: { chairmanId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, scopeKey: true } });
  const latest = new Map<string, string>();
  for (const r of runs) if (!latest.has(r.scopeKey || "")) latest.set(r.scopeKey || "", r.id);
  if (!latest.size) return [];
  const es = await prisma.timetableEntry.findMany({ where: { timetableRunId: { in: Array.from(latest.values()) }, scheduleSection: { instructorId: userId } }, select: { dayOfWeek: true, startHour: true, endHour: true, room: { select: { name: true } }, scheduleSection: { select: { sectionLabel: true, course: { select: { code: true } }, group: { select: { name: true } } } } } });
  return es.map((e) => ({ dow: DAY_NAMES.indexOf(e.dayOfWeek.slice(0, 3)), startMin: Math.round(e.startHour * 60), endMin: Math.round(e.endHour * 60), label: `${e.scheduleSection.course?.code || e.scheduleSection.group?.name || "Class"} ${e.scheduleSection.sectionLabel} · ${e.room.name}` })).filter((r) => r.dow >= 0);
}

/** Everything busy in the range, with the teacher's own labels and privacy. */
export async function busyItems(userId: string, fromDay: string, days: number, s?: Settings): Promise<Item[]> {
  const set = s || (await settingsOf(userId));
  const from = at(fromDay, 0), to = at(addDays(fromDay, days), 0);
  const [classes, slots, blocks, appts, ext] = await Promise.all([
    classRows(userId).catch(() => []),
    db.counsellingSlot.findMany({ where: { counsellorId: userId, startsAt: { gte: new Date(from), lt: new Date(to) } }, select: { startsAt: true, endsAt: true, place: true } }).catch(() => []) as Promise<{ startsAt: Date; endsAt: Date; place: string | null }[]>,
    blocksOf(userId).catch(() => [] as Block[]),
    db.appointmentRequest.findMany({ where: { OR: [{ teacherId: userId, status: { in: ["PENDING", "ACCEPTED"] } }, { requesterId: userId, status: "ACCEPTED" }], startsAt: { lt: new Date(to) }, endsAt: { gt: new Date(from) } } }).catch(() => []) as Promise<Appt[]>,
    externalBusy(userId, from, to).catch(() => []),
  ]);
  const items: Item[] = [
    ...expandWeekly(classes, fromDay, days, (r, start, end) => ({ start, end, kind: "CLASS", label: r.label, privacy: set.classPrivacy })),
    ...slots.map((x) => ({ start: new Date(x.startsAt).getTime(), end: new Date(x.endsAt).getTime(), kind: "COUNSELLING" as const, label: `Counselling hours${x.place ? ` · ${x.place}` : ""}`, privacy: set.counsellingPrivacy })),
    ...expandWeekly(blocks.filter((b) => b.dayOfWeek !== null).map((b) => ({ ...b, dow: b.dayOfWeek! })), fromDay, days, (b, start, end) => ({ start, end, kind: "BLOCK", label: b.label || "Busy", privacy: b.privacy, id: b.id })),
    ...blocks.filter((b) => b.date && b.date >= fromDay && b.date < addDays(fromDay, days)).map((b) => ({ start: at(b.date!, b.startMin), end: at(b.date!, b.endMin), kind: "BLOCK" as const, label: b.label || "Busy", privacy: b.privacy, id: b.id })),
    ...appts.map((a) => ({ start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime(), kind: "APPOINTMENT" as const, label: a.teacherId === userId ? `${a.status === "PENDING" ? "Requested: " : "Appointment: "}${a.requesterName} — ${a.reason}` : `Appointment (you asked) — ${a.reason}`, privacy: "BUSY" as Privacy, id: a.id })),
    ...ext.map((x) => ({ start: x.start, end: x.end, kind: "EXTERNAL" as const, label: x.provider === "GOOGLE" ? "Busy (Google Calendar)" : "Busy (Outlook)", privacy: "BUSY" as Privacy })),
  ];
  return items.sort((a, b) => a.start - b.start);
}

/** Booked (pending or accepted) appointments per local day, for the daily limit. */
async function bookedPerDay(teacherId: string, from: number, to: number) {
  const rows = (await db.appointmentRequest.findMany({ where: { teacherId, status: { in: ["PENDING", "ACCEPTED"] }, startsAt: { gte: new Date(from), lt: new Date(to) } }, select: { startsAt: true } }).catch(() => [])) as { startsAt: Date }[];
  const out: Record<string, number> = {};
  for (const r of rows) { const d = localDay(new Date(r.startsAt).getTime()); out[d] = (out[d] || 0) + 1; }
  return out;
}

/** The calendar as the viewer may see it, and (for others) the free slots they can ask for. */
export async function calendarView(teacherId: string, fromDay: string, days: number, owner: boolean) {
  const settings = await settingsOf(teacherId);
  const items = await busyItems(teacherId, fromDay, days, settings);
  const per = await bookedPerDay(teacherId, at(fromDay, 0), at(addDays(fromDay, days), 0));
  return { settings, items: forViewer(items, owner), free: freeSlots(settings, items, fromDay, days, Date.now(), per) };
}

type Requester = { kind: "STUDENT" | "STAFF"; id: string; name: string; chairmanId: string | null };
export async function requestAppointment(teacherId: string, by: Requester, startIso: string, reason: string) {
  if (teacherId === by.id) throw new Error("You cannot book yourself.");
  const why = (reason || "").trim();
  if (why.length < 3) throw new Error("Say briefly what the appointment is about.");
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) throw new Error("Choose a time.");
  const day = localDay(start);
  const { free } = await calendarView(teacherId, day, 1, false);
  const slot = free.find((f) => f.start === start);
  if (!slot) throw new Error("That time is no longer free. Pick another.");
  const row = { id: randomUUID(), chairmanId: by.chairmanId, teacherId, requesterKind: by.kind, requesterId: by.id, requesterName: by.name.slice(0, 120), startsAt: new Date(slot.start), endsAt: new Date(slot.end), reason: why.slice(0, 500), status: "PENDING" };
  await db.appointmentRequest.create({ data: row });
  await notifyUsers([teacherId], { kind: "APPOINTMENT", title: `Appointment request from ${row.requesterName}`, body: `${whenText(slot.start)} — ${row.reason.slice(0, 160)}`, href: "/my-calendar" }).catch(() => null);
  return row;
}

async function tellRequester(a: Appt, title: string, body: string) {
  if (a.requesterKind === "STUDENT") await notifyStudents([a.requesterId], { kind: "APPOINTMENT", title, body, href: "/student/appointments" }, a.chairmanId || undefined).catch(() => null);
  else await notifyUsers([a.requesterId], { kind: "APPOINTMENT", title, body, href: "/appointments" }).catch(() => null);
}

export async function respond(id: string, teacherId: string, accept: boolean, note: string | null) {
  const a = (await db.appointmentRequest.findFirst({ where: { id, teacherId } })) as Appt | null;
  if (!a) throw new Error("Not found.");
  if (a.status !== "PENDING") throw new Error("This request has already been answered.");
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } });
  await db.appointmentRequest.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "DECLINED", note: (note || "").slice(0, 500) || null, decidedAt: new Date() } });
  const when = whenText(new Date(a.startsAt).getTime());
  if (accept) {
    await tellRequester(a, `${teacher?.name || "Your teacher"} accepted: ${when}`, `${note ? `${note.slice(0, 160)} · ` : ""}Add it to your calendar from the appointments page.`);
    await notifyUsers([teacherId], { kind: "APPOINTMENT", title: `Appointment with ${a.requesterName}: ${when}`, body: a.reason.slice(0, 160), href: "/my-calendar" }).catch(() => null);
  } else await tellRequester(a, `${teacher?.name || "Your teacher"} could not meet at ${when}`, note ? note.slice(0, 200) : "Please pick another time.");
}

/** Cancel by either side (the teacher, or the person who asked). */
export async function cancelAppointment(id: string, by: { id: string }) {
  const a = (await db.appointmentRequest.findFirst({ where: { id, OR: [{ teacherId: by.id }, { requesterId: by.id }] } })) as Appt | null;
  if (!a) throw new Error("Not found.");
  if (!["PENDING", "ACCEPTED"].includes(a.status)) throw new Error("Already closed.");
  await db.appointmentRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } });
  const when = whenText(new Date(a.startsAt).getTime());
  if (by.id === a.teacherId) await tellRequester(a, `Appointment cancelled: ${when}`, "The teacher cancelled it. Please pick another time.");
  else await notifyUsers([a.teacherId], { kind: "APPOINTMENT", title: `${a.requesterName} cancelled ${when}`, body: a.reason.slice(0, 160), href: "/my-calendar" }).catch(() => null);
}

export async function teacherAppointments(teacherId: string): Promise<Appt[]> {
  return db.appointmentRequest.findMany({ where: { teacherId, OR: [{ status: "PENDING" }, { endsAt: { gte: new Date(Date.now() - 7 * 864e5) } }] }, orderBy: { startsAt: "asc" }, take: 200 });
}
export async function myRequests(requesterId: string): Promise<Appt[]> {
  return db.appointmentRequest.findMany({ where: { requesterId, endsAt: { gte: new Date(Date.now() - 30 * 864e5) } }, orderBy: { startsAt: "asc" }, take: 100 });
}
export async function appointmentFor(id: string, viewerId: string): Promise<Appt | null> {
  return db.appointmentRequest.findFirst({ where: { id, OR: [{ teacherId: viewerId }, { requesterId: viewerId }] } });
}

/** Teachers a student may book: those teaching their current courses, and their batch advisor. */
export async function teachersForStudent(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { advisorId: true } } } });
  const en = await prisma.studentEnrollment.findMany({ where: { studentId, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { code: true, instructorId: true } } } }).catch(() => []);
  const why = new Map<string, string[]>();
  for (const e of en) if (e.course.instructorId) why.set(e.course.instructorId, [...(why.get(e.course.instructorId) || []), e.course.code]);
  if (st?.batch.advisorId) why.set(st.batch.advisorId, [...(why.get(st.batch.advisorId) || []), "batch advisor"]);
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(why.keys()).concat(["none"]) }, isActive: true }, select: { id: true, name: true } });
  return users.map((u) => ({ id: u.id, name: u.name, as: why.get(u.id)!.join(", ") })).sort((a, b) => a.name.localeCompare(b.name));
}
