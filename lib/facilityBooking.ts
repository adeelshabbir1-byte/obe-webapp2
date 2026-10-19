import { randomUUID } from "crypto";
import { prisma } from "./db";
import { eventClashes } from "./eventClash";

// Booking the institute's shared places — halls, seminar / conference rooms, classrooms when free, the masjid,
// sports grounds, common areas — with a clash check against other bookings and, for timetabled rooms, the classes held
// there that day. Holidays and exam periods on the date are shown as a warning.

const bdb = prisma as unknown as Record<string, any>;
export const BOOKING_HINT = "Facility booking needs prisma/migration_campus_ops.sql — run it in Supabase.";
export type Booking = { id: string; chairmanId: string; resource: string; roomId: string | null; date: Date; startTime: string; endTime: string; purpose: string; bookedById: string; status: string };
const BOOKABLE_ROOMS = ["LECTURE_HALL", "AUDITORIUM", "SEMINAR", "CONFERENCE", "LAB", "CLASSROOM", "OTHER"];
const BOOKABLE_SERVICES = ["SPORTS", "PRAYER", "CAFETERIA", "DISPENSARY", "OTHER"];
const toH = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? Number(m[1]) + Number(m[2]) / 60 : NaN; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What can be booked: [key, label]. key = room:<Room id> | fac:<FacilityRoom id> | svc:<FacilityService id> | area:<name> */
export async function resources(chairmanId: string): Promise<[string, string][]> {
  const [rooms, fac, svc] = await Promise.all([
    prisma.room.findMany({ where: { chairmanId }, select: { id: true, name: true, type: true, capacity: true }, orderBy: { name: "asc" } }),
    prisma.facilityRoom.findMany({ where: { chairmanId, roomType: { in: BOOKABLE_ROOMS } }, select: { id: true, name: true, roomType: true, capacity: true }, orderBy: { name: "asc" } }).catch(() => []),
    prisma.facilityService.findMany({ where: { chairmanId, kind: { in: BOOKABLE_SERVICES }, available: true }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }).catch(() => []),
  ]);
  const roomNames = new Set(rooms.map((r) => r.name.toLowerCase()));
  return [
    ...fac.filter((r) => !roomNames.has(r.name.toLowerCase())).map((r) => [`fac:${r.id}`, `${r.name} (${r.roomType.toLowerCase().replace(/_/g, " ")}${r.capacity ? `, ${r.capacity} seats` : ""})`] as [string, string]),
    ...rooms.map((r) => [`room:${r.id}`, `${r.name} (${r.type === "LAB" ? "lab" : "classroom"}, ${r.capacity} seats)`] as [string, string]),
    ...svc.map((s) => [`svc:${s.id}`, `${s.name} (${s.kind === "PRAYER" ? "masjid / prayer area" : s.kind.toLowerCase()})`] as [string, string]),
    ["area:Common area / lawn", "Common area / lawn"], ["area:Main hall", "Main hall"],
  ];
}

export async function bookingsOn(chairmanId: string, from: Date, days: number): Promise<Booking[] | null> {
  try { return await bdb.facilityBooking.findMany({ where: { chairmanId, status: "BOOKED", date: { gte: from, lt: new Date(from.getTime() + days * 864e5) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }); } catch { return null; }
}

/** Clashes for a proposed booking: other bookings of the place, classes in that room, and the date's notes. */
export async function clashes(chairmanId: string, resource: string, date: Date, start: string, end: string, exceptId?: string) {
  const s = toH(start), e = toH(end);
  const out: string[] = [];
  const same = ((await bdb.facilityBooking.findMany({ where: { chairmanId, resource, date, status: "BOOKED", ...(exceptId ? { id: { not: exceptId } } : {}) } })) as Booking[]).filter((b) => toH(b.startTime) < e && s < toH(b.endTime));
  for (const b of same) out.push(`Already booked ${b.startTime}–${b.endTime}: ${b.purpose}`);
  if (resource.startsWith("room:")) {
    const runs = await prisma.timetableRun.findMany({ where: { chairmanId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, scopeKey: true } });
    const latest = new Map<string, string>();
    for (const r of runs) if (!latest.has(r.scopeKey || "")) latest.set(r.scopeKey || "", r.id);
    const cls = latest.size ? await prisma.timetableEntry.findMany({ where: { timetableRunId: { in: Array.from(latest.values()) }, roomId: resource.slice(5), dayOfWeek: DAYS[date.getUTCDay()] }, select: { startHour: true, endHour: true, scheduleSection: { select: { course: { select: { code: true } }, sectionLabel: true } } } }) : [];
    for (const c of cls) if (c.startHour < e && s < c.endHour) out.push(`Class ${c.scheduleSection.course?.code || ""} ${c.scheduleSection.sectionLabel || ""} ${c.startHour}:00–${c.endHour}:00`);
  }
  const notes = (await eventClashes(chairmanId, date.toISOString().slice(0, 10), start, end).catch(() => null))?.notes.filter((n) => n.kind !== "Event").map((n) => `${n.kind}: ${n.text}`) || [];
  return { blocking: out, notes };
}

export async function book(chairmanId: string, d: { resource: string; date: Date; startTime: string; endTime: string; purpose: string }, by: string) {
  if (!(toH(d.startTime) < toH(d.endTime))) throw new Error("The end time must be after the start time.");
  const c = await clashes(chairmanId, d.resource, d.date, d.startTime, d.endTime);
  if (c.blocking.length) throw new Error(`Clash — ${c.blocking.join("; ")}`);
  await bdb.facilityBooking.create({ data: { id: randomUUID(), chairmanId, ...d, roomId: d.resource.startsWith("room:") ? d.resource.slice(5) : null, bookedById: by, status: "BOOKED", createdAt: new Date() } });
  return c.notes;
}
export async function cancel(chairmanId: string, id: string, user: { id: string; role: string }) {
  const b = (await bdb.facilityBooking.findFirst({ where: { id, chairmanId } })) as Booking | null;
  if (!b) throw new Error("Not found.");
  if (b.bookedById !== user.id && !["CHAIRMAN", "FACILITIES_MANAGER", "HEAD_OF_DEPARTMENT", "STUDENT_AFFAIRS"].includes(user.role)) throw new Error("Only who booked it can cancel.");
  await bdb.facilityBooking.update({ where: { id }, data: { status: "CANCELLED" } });
}
