import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getTimetableEntries, type TimetableEntryView } from "./timetableView";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { DAYS, type E } from "./timetableCore";

// The timetable as it really happens (Adeel prompt §22–23): the base timetable plus changes — one-off moves, permanent
// moves from a date, cancellations (the room is free that day), substitutes, make-up classes and room bookings. Every
// view (grids, 7-day room availability, today's changes, calendar feeds, class log) reads it from here.
const db = prisma as unknown as Record<string, any>;
export type Change = { id: string; entryId: string | null; kind: string; date: Date | null; fromDate: Date | null; toDay: string | null; toStart: number | null; toEnd: number | null; toRoomId: string | null; substituteId: string | null; sectionId: string | null; title: string | null; reason: string | null; status: string; byId: string; createdAt: Date };
export type Live = E & { courseTitle?: string; status?: "NORMAL" | "MOVED" | "CANCELLED" | "SUBSTITUTE" | "MAKEUP" | "BOOKING"; note?: string; substitute?: string; date?: string };
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (d: Date) => ["Sunday", ...DAYS][d.getUTCDay()];
const at = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function changesBetween(chairmanId: string, from: Date, to: Date): Promise<Change[]> {
  return ((await db.timetableChange?.findMany({ where: { chairmanId, status: "ACTIVE", OR: [{ date: { gte: at(from), lte: at(to) } }, { kind: "MOVE_FROM", fromDate: { lte: at(to) } }] } }).catch(() => [])) || []) as Change[];
}
const rooms = async (ids: string[]) => new Map((await prisma.room.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, name: true, type: true } })).map((r) => [r.id, r]));
const people = async (ids: string[]) => new Map((await prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

/** Classes on one real date, with every change applied. */
export async function onDate(chairmanId: string, date: Date, base?: TimetableEntryView[], changes?: Change[]): Promise<Live[]> {
  const b = base || (await getTimetableEntries(chairmanId));
  const ch = changes || (await changesBetween(chairmanId, date, date));
  const d = at(date), wd = weekday(d);
  const R = await rooms(ch.map((c) => c.toRoomId || "").filter(Boolean)), P = await people(ch.map((c) => c.substituteId || "").filter(Boolean));
  const holiday = await db.holiday?.findFirst({ where: { date: d, coordinator: { managedById: chairmanId } } }).catch(() => null);
  const out: Live[] = [];
  for (const e0 of b) {
    let e: Live = { ...e0, status: "NORMAL", date: dayKey(d) };
    const perm = ch.filter((c) => c.kind === "MOVE_FROM" && c.entryId === e0.id && c.fromDate && at(c.fromDate) <= d).sort((x, y) => +new Date(y.fromDate!) - +new Date(x.fromDate!))[0];
    if (perm) e = { ...e, dayOfWeek: perm.toDay || e.dayOfWeek, startHour: perm.toStart ?? e.startHour, endHour: perm.toEnd ?? e.endHour, roomId: perm.toRoomId || e.roomId, roomName: perm.toRoomId ? R.get(perm.toRoomId)?.name || e.roomName : e.roomName };
    const same = ch.filter((c) => c.entryId === e0.id && c.date && dayKey(at(c.date)) === dayKey(d));
    const once = same.find((c) => c.kind === "MOVE_ONCE");
    if (e.dayOfWeek !== wd && !once) continue;
    if (holiday) { out.push({ ...e, status: "CANCELLED", note: `Holiday: ${holiday.label}` }); continue; }
    const cancel = same.find((c) => c.kind === "CANCEL");
    if (cancel) { out.push({ ...e, status: "CANCELLED", note: cancel.reason || "Cancelled" }); continue; }
    if (once) e = { ...e, startHour: once.toStart ?? e.startHour, endHour: once.toEnd ?? e.endHour, roomId: once.toRoomId || e.roomId, roomName: once.toRoomId ? R.get(once.toRoomId)?.name || e.roomName : e.roomName, status: "MOVED", note: once.reason || "Rescheduled" };
    const sub = same.find((c) => c.kind === "SUBSTITUTE");
    if (sub?.substituteId) e = { ...e, status: "SUBSTITUTE", substitute: P.get(sub.substituteId) || "substitute", note: `Taught by ${P.get(sub.substituteId) || "a substitute"} (substitute)` };
    out.push(e);
  }
  // Make-up classes and room bookings on that date.
  const extra = ch.filter((c) => (c.kind === "MAKEUP" || c.kind === "BOOKING") && c.date && dayKey(at(c.date)) === dayKey(d));
  for (const c of extra) {
    const src = c.entryId ? b.find((x) => x.id === c.entryId) : null;
    out.push({ id: `chg:${c.id}`, dayOfWeek: wd, startHour: c.toStart || 8, endHour: c.toEnd || 9, courseCode: src?.courseCode || c.title || "Booking", instructorId: src?.instructorId || c.byId, instructorName: src?.instructorName || "", roomId: c.toRoomId || "", roomName: (c.toRoomId && R.get(c.toRoomId)?.name) || "", batchLabels: src?.batchLabels || [], sectionKeys: src?.sectionKeys || [], status: c.kind === "MAKEUP" ? "MAKEUP" : "BOOKING", note: c.title || c.reason || "", date: dayKey(d) });
  }
  return out.sort((a, z) => a.startHour - z.startHour);
}

/** The next N real days (from today), with changes. Cancelled classes don't occupy their room. */
export async function nextDays(chairmanId: string, n = 7, from = new Date()) {
  const base = await getTimetableEntries(chairmanId);
  const end = new Date(at(from).getTime() + (n - 1) * 864e5);
  const ch = await changesBetween(chairmanId, from, end);
  const days: { date: string; weekday: string; classes: Live[] }[] = [];
  for (let i = 0; i < n; i++) { const d = new Date(at(from).getTime() + i * 864e5); if (d.getUTCDay() === 0) continue; days.push({ date: dayKey(d), weekday: weekday(d), classes: await onDate(chairmanId, d, base, ch) }); }
  return days;
}

/** Is everyone free (teacher, sections, room) at this time on this date? Returns the clash, or null. */
export async function checkFree(chairmanId: string, date: Date, start: number, end: number, opts: { teacherId?: string; sectionKeys?: string[]; roomId?: string; ignoreEntryId?: string }) {
  const list = (await onDate(chairmanId, date)).filter((x) => x.status !== "CANCELLED" && x.id !== opts.ignoreEntryId && x.startHour < end && start < x.endHour);
  if (opts.teacherId) { const t = list.find((x) => x.instructorId === opts.teacherId); if (t) return `The teacher has ${t.courseCode} then.`; }
  if (opts.sectionKeys?.length) { const s = list.find((x) => x.sectionKeys.some((k) => opts.sectionKeys!.includes(k))); if (s) return `The section has ${s.courseCode} then.`; }
  if (opts.roomId) { const r = list.find((x) => x.roomId === opts.roomId); if (r) return `The room is booked for ${r.courseCode} then.`; }
  return null;
}

async function studentsOfEntry(entry: TimetableEntryView) {
  const ids = await prisma.student.findMany({ where: { batchId: { in: entry.batchIds.concat("none") }, status: "ACTIVE" }, select: { id: true } }).catch(() => []);
  return ids.map((s) => s.id);
}
async function tell(entry: TimetableEntryView, title: string, body: string, also: string[] = []) {
  await notifyUsers([entry.instructorId, ...also], { kind: "TIMETABLE", title, body, href: "/timetable/live" }).catch(() => null);
  const { notifyStudents } = await import("./studentNotices");
  await notifyStudents(await studentsOfEntry(entry), { kind: "TIMETABLE", title, body, href: "/student/timetable" }).catch(() => null);
}

export type ChangeIn = { entryId: string; kind: "MOVE_ONCE" | "MOVE_FROM" | "CANCEL" | "MAKEUP" | "SUBSTITUTE"; date: string; toStart?: number; toEnd?: number; toRoomId?: string; substituteId?: string; reason: string };
/** Reschedule / cancel / make-up / substitute one class. Permanent moves by a teacher wait for the PL / DC. */
export async function changeClass(user: { id: string; role: string; name: string }, chairmanId: string, c: ChangeIn) {
  if (!db.timetableChange) throw new Error("Run prisma/migration_adeel_p6.sql in Supabase first.");
  const entry = (await getTimetableEntries(chairmanId)).find((x) => x.id === c.entryId);
  if (!entry) throw new Error("Class not found.");
  const leader = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"].includes(user.role);
  if (!leader && entry.instructorId !== user.id) throw new Error("Only the class's teacher or the Program Lead / Department Coordinator changes it.");
  if (!c.reason || c.reason.trim().length < 3) throw new Error("Give a reason.");
  const date = new Date(c.date + "T00:00:00Z");
  const start = c.toStart ?? entry.startHour, end = c.toEnd ?? (start + (entry.endHour - entry.startHour));
  if (c.kind === "MOVE_ONCE" || c.kind === "MOVE_FROM" || c.kind === "MAKEUP") {
    const clash = await checkFree(chairmanId, date, start, end, { teacherId: entry.instructorId, sectionKeys: entry.sectionKeys, roomId: c.toRoomId || entry.roomId, ignoreEntryId: c.kind === "MAKEUP" ? undefined : entry.id });
    if (clash) throw new Error(clash);
  }
  if (c.kind === "SUBSTITUTE") {
    if (!c.substituteId) throw new Error("Choose the substitute.");
    const clash = await checkFree(chairmanId, date, entry.startHour, entry.endHour, { teacherId: c.substituteId });
    if (clash) throw new Error("The substitute isn't free: " + clash);
  }
  const status = c.kind === "MOVE_FROM" && !leader ? "PENDING" : "ACTIVE";
  const id = randomUUID();
  await db.timetableChange.create({ data: { id, chairmanId, entryId: entry.id, kind: c.kind, date: c.kind === "MOVE_FROM" ? null : date, fromDate: c.kind === "MOVE_FROM" ? date : null, toDay: c.kind === "MOVE_FROM" ? ["Sunday", ...DAYS][date.getUTCDay()] : null, toStart: start, toEnd: end, toRoomId: c.toRoomId || null, substituteId: c.substituteId || null, reason: c.reason.trim().slice(0, 300), status, byId: user.id, approvedById: status === "ACTIVE" ? user.id : null } });
  await writeAuditLog({ actorUserId: user.id, action: `CLASS_${c.kind}`, entityType: "TimetableEntry", entityId: entry.id, metadata: { date: c.date, reason: c.reason } }).catch(() => null);
  const when = `${c.date} ${String(Math.floor(start)).padStart(2, "0")}:${String(Math.round((start % 1) * 60)).padStart(2, "0")}`;
  const msg = c.kind === "CANCEL" ? `${entry.courseCode} on ${c.date} is cancelled — ${c.reason}` : c.kind === "SUBSTITUTE" ? `${entry.courseCode} on ${c.date} is taught by a substitute` : c.kind === "MAKEUP" ? `Make-up class: ${entry.courseCode} on ${when}` : `${entry.courseCode} moved to ${when}${c.kind === "MOVE_FROM" ? " (from now on)" : ""}`;
  if (status === "ACTIVE") await tell(entry, msg, c.reason, c.substituteId ? [c.substituteId] : []);
  else {
    const pls = await prisma.user.findMany({ where: { role: { in: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] }, managedById: chairmanId, isActive: true }, select: { id: true }, take: 20 });
    await notifyUsers(pls.map((p) => p.id), { kind: "TIMETABLE", title: `Permanent change requested: ${entry.courseCode}`, body: `${user.name}: ${c.reason}`, href: "/timetable/live?tab=review" }).catch(() => null);
  }
  return { id, status };
}

/** Book a free room for a tutorial, meeting or extra class on a date. */
export async function bookRoom(user: { id: string }, chairmanId: string, b: { date: string; start: number; end: number; roomId: string; title: string; entryId?: string }) {
  const date = new Date(b.date + "T00:00:00Z");
  const clash = await checkFree(chairmanId, date, b.start, b.end, { roomId: b.roomId });
  if (clash) throw new Error(clash);
  await db.timetableChange.create({ data: { id: randomUUID(), chairmanId, entryId: b.entryId || null, kind: b.entryId ? "MAKEUP" : "BOOKING", date, toStart: b.start, toEnd: b.end, toRoomId: b.roomId, title: b.title.slice(0, 120), reason: b.title.slice(0, 120), byId: user.id, approvedById: user.id } });
}

/** Today's changes for one person (teacher) or one student's sections. */
export async function todaysChanges(chairmanId: string, who: { teacherId?: string; sectionKeys?: string[] }) {
  const list = await onDate(chairmanId, new Date());
  return list.filter((x) => x.status && x.status !== "NORMAL" && x.status !== "BOOKING" && ((who.teacherId && x.instructorId === who.teacherId) || x.sectionKeys.some((k) => who.sectionKeys?.includes(k))));
}

/** The class log of a course's entries: every date since `from`, planned vs actual (floor register), status and who taught. */
export async function classLog(chairmanId: string, entryIds: string[], from: Date, to = new Date()) {
  const base = (await getTimetableEntries(chairmanId)).filter((e) => entryIds.includes(e.id));
  const ch = (await changesBetween(chairmanId, from, to)).filter((c) => !c.entryId || entryIds.includes(c.entryId));
  const reg = ((await db.floorRegister?.findMany({ where: { entryId: { in: entryIds.concat("none") }, date: { gte: at(from), lte: at(to) } } }).catch(() => [])) || []) as { entryId: string; date: Date; startedAt: number | null; endedAt: number | null; held: boolean; roomId: string | null; review: string | null; reviewReason: string | null }[];
  const rows: { date: string; course: string; planned: string; actual: string; room: string; teacher: string; status: string; note: string }[] = [];
  for (let d = at(from); d <= at(to); d = new Date(d.getTime() + 864e5)) {
    if (d.getUTCDay() === 0) continue;
    for (const l of (await onDate(chairmanId, d, base, ch)).filter((x) => entryIds.includes(x.id) || x.id.startsWith("chg:"))) {
      const b = base.find((x) => x.id === l.id);
      const r = reg.find((x) => x.entryId === l.id && dayKey(at(new Date(x.date))) === dayKey(d));
      const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
      rows.push({ date: dayKey(d), course: l.courseCode, planned: b ? `${fmt(b.startHour)}–${fmt(b.endHour)} ${b.roomName}` : "—", actual: r ? (r.held ? `${r.startedAt != null ? fmt(r.startedAt) : "?"}–${r.endedAt != null ? fmt(r.endedAt) : "?"}` : "not held") : "—", room: l.roomName, teacher: l.substitute ? `${l.substitute} (substitute)` : l.instructorName, status: r && !r.held ? "NOT HELD" : r && b && r.startedAt != null && r.startedAt > b.startHour + 0.08 ? "LATE" : l.status || "NORMAL", note: [l.note, r?.review ? `${r.review}${r.reviewReason ? `: ${r.reviewReason}` : ""}` : ""].filter(Boolean).join(" · ") });
    }
  }
  return rows;
}
