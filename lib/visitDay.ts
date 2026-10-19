import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";

// The visit day itself: an hour-by-hour plan whose live status anyone in charge updates (every faculty member is
// notified), the arrangements to check beforehand (food, rooms, internet, LED / PC, transport, files), and mock-visit
// findings whose recommendations become tasks with an owner and a due date.

const vdb = prisma as unknown as Record<string, any>;
export const VISIT_HINT = "The visit day needs prisma/migration_campus_ops.sql — run it in Supabase.";
export const STATUSES: Record<string, string> = { PENDING: "Not started", IN_PROGRESS: "In progress", DONE: "Done", DELAYED: "Delayed", SKIPPED: "Skipped" };
export const CATEGORIES: Record<string, string> = { FOOD: "Food & refreshments", ROOM: "Rooms & seating", AV: "LED / projector / PC / sound", INTERNET: "Internet", TRANSPORT: "Transport & protocol", FILES: "Course files & evidence", PEOPLE: "People to be present", OTHER: "Other" };

export type Item = { id: string; cycleId: string; kind: "PLAN" | "CHECK"; dayDate: Date | null; startTime: string | null; endTime: string | null; title: string; place: string | null; category: string | null; ownerId: string | null; status: string; note: string | null; orderNo: number; updatedById: string | null; updatedAt: Date };
export type Finding = { id: string; cycleId: string; area: string; finding: string; recommendation: string; severity: string; ownerId: string | null; dueDate: Date | null; status: string; doneNote: string | null; createdAt: Date; closedAt: Date | null };

const PLAN: [string, string, string, string][] = [
  ["08:30", "09:00", "Reception of the panel", "Main gate / lobby"], ["09:00", "09:30", "Welcome and opening meeting with the Head / Dean", "Board room"],
  ["09:30", "10:30", "Program presentation", "Presentation room"], ["10:30", "10:45", "Tea break", "Board room"],
  ["10:45", "12:00", "Course files and evidence review", "Evidence room"], ["12:00", "13:00", "Meeting with faculty", "Seminar room"],
  ["13:00", "14:00", "Lunch and prayer", "Guest dining / masjid"], ["14:00", "14:45", "Meeting with students", "Seminar room"],
  ["14:45", "15:30", "Meeting with alumni and employers", "Seminar room"], ["15:30", "16:30", "Tour of labs, library and facilities", "Campus"],
  ["16:30", "17:00", "Panel's private session", "Board room"], ["17:00", "17:30", "Exit meeting", "Board room"],
];
const CHECKS: [string, string][] = [
  ["FOOD", "Breakfast / tea for the panel arranged"], ["FOOD", "Lunch menu and head count confirmed"], ["FOOD", "Water and refreshments in every meeting room"],
  ["ROOM", "Presentation room booked for the whole day"], ["ROOM", "Seating for faculty, student and alumni meetings"], ["ROOM", "Evidence room arranged and locked overnight"],
  ["AV", "LED / projector tested with the presentation laptop"], ["AV", "Backup laptop, clicker and HDMI / VGA adapters"], ["AV", "Microphone and sound tested"],
  ["INTERNET", "Wi-Fi tested in all rooms, guest login printed"], ["INTERNET", "Online portal (OBEHUB) open on the evidence-room PC"],
  ["TRANSPORT", "Pickup and drop of the panel"], ["TRANSPORT", "Parking reserved, protocol officer named"],
  ["FILES", "Course files of every course in the cycle arranged"], ["FILES", "SAR and annexures printed and bound"], ["FILES", "Visitor pass links ready for the panel"],
  ["PEOPLE", "Student list for the meeting (every batch)"], ["PEOPLE", "Alumni and employers invited and confirmed"], ["PEOPLE", "All faculty present — no leave on the day"],
  ["OTHER", "Signage, cleanliness and washrooms checked"], ["OTHER", "Souvenirs / protocol gifts"],
];

export async function itemsOf(cycleId: string): Promise<Item[] | null> {
  try { return await vdb.visitDayItem.findMany({ where: { cycleId }, orderBy: [{ kind: "desc" }, { orderNo: "asc" }] }); } catch { return null; }
}
export async function findingsOf(cycleId: string): Promise<Finding[]> {
  try { return await vdb.mockVisitFinding.findMany({ where: { cycleId }, orderBy: { createdAt: "asc" } }); } catch { return []; }
}

/** Fill in the standard plan and checklist (only what is not there yet). */
export async function seed(chairmanId: string, cycleId: string, day: Date | null, by: string) {
  const have = (await itemsOf(cycleId)) || [];
  const now = new Date();
  const rows: Record<string, unknown>[] = [];
  if (!have.some((i) => i.kind === "PLAN")) PLAN.forEach(([s, e, t, p], k) => rows.push({ id: randomUUID(), chairmanId, cycleId, kind: "PLAN", dayDate: day, startTime: s, endTime: e, title: t, place: p, orderNo: k, updatedById: by, updatedAt: now, createdAt: now }));
  if (!have.some((i) => i.kind === "CHECK")) CHECKS.forEach(([c, t], k) => rows.push({ id: randomUUID(), chairmanId, cycleId, kind: "CHECK", title: t, category: c, orderNo: k, updatedById: by, updatedAt: now, createdAt: now }));
  if (rows.length) await vdb.visitDayItem.createMany({ data: rows });
  return rows.length;
}

/** Everyone who should hear about the day: the cycle's department staff (or the whole institute). */
export async function faculty(cycle: { chairmanId: string; departmentId: string | null }) {
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: cycle.chairmanId }, select: { id: true } });
  const people = await prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ id: cycle.chairmanId }, { managedById: cycle.chairmanId }, { managedById: { in: leads.map((l) => l.id).concat("none") } }], ...(cycle.departmentId ? { AND: [{ OR: [{ departmentId: cycle.departmentId }, { departmentId: null }] }] } : {}) }, select: { id: true } });
  return people.map((p) => p.id);
}

export async function updateItem(cycle: { id: string; chairmanId: string; departmentId: string | null; title: string }, id: string, d: { status?: string; note?: string | null; ownerId?: string | null; startTime?: string; endTime?: string; title?: string; place?: string | null }, by: { id: string; name: string }) {
  const it = (await vdb.visitDayItem.findFirst({ where: { id, cycleId: cycle.id } })) as Item | null;
  if (!it) throw new Error("Not found.");
  const data: Record<string, unknown> = { updatedById: by.id, updatedAt: new Date() };
  for (const k of ["status", "note", "ownerId", "startTime", "endTime", "title", "place"] as const) if (d[k] !== undefined) data[k] = d[k];
  await vdb.visitDayItem.update({ where: { id }, data });
  if (d.status && d.status !== it.status && it.kind === "PLAN") {
    const when = `${it.startTime || ""}${it.endTime ? `–${it.endTime}` : ""}`;
    await notifyUsers(await faculty(cycle), { kind: "ACCREDITATION", title: `Visit day: ${it.title} — ${STATUSES[d.status] || d.status}`, body: `${when} ${it.place || ""}. Updated by ${by.name}${d.note ? `: ${d.note}` : "."}`, href: `/accreditation/visit-day/${cycle.id}`, exceptId: by.id });
  }
  if (d.ownerId && d.ownerId !== it.ownerId) await notifyUsers([d.ownerId], { kind: "ACCREDITATION", title: `You are in charge of: ${it.title}`, body: `For ${cycle.title}.`, href: `/accreditation/visit-day/${cycle.id}` });
}

export async function addItem(chairmanId: string, cycleId: string, d: { kind: "PLAN" | "CHECK"; title: string; startTime?: string | null; endTime?: string | null; place?: string | null; category?: string | null; dayDate?: Date | null }, by: string) {
  const n = await vdb.visitDayItem.count({ where: { cycleId, kind: d.kind } });
  await vdb.visitDayItem.create({ data: { id: randomUUID(), chairmanId, cycleId, kind: d.kind, title: d.title, startTime: d.startTime || null, endTime: d.endTime || null, place: d.place || null, category: d.category || null, dayDate: d.dayDate || null, orderNo: n, updatedById: by, updatedAt: new Date(), createdAt: new Date() } });
}

export async function addFinding(cycle: { id: string; chairmanId: string; title: string }, d: { area: string; finding: string; recommendation: string; severity: string; ownerId: string | null; dueDate: Date | null }, by: string) {
  await vdb.mockVisitFinding.create({ data: { id: randomUUID(), chairmanId: cycle.chairmanId, cycleId: cycle.id, ...d, createdById: by, createdAt: new Date() } });
  if (d.ownerId) await notifyUsers([d.ownerId], { kind: "ACCREDITATION", title: `Mock visit task: ${d.area}`, body: `${d.recommendation}${d.dueDate ? ` — due ${d.dueDate.toISOString().slice(0, 10)}` : ""}`, href: `/accreditation/visit-day/${cycle.id}` });
}
export async function closeFinding(cycleId: string, id: string, done: boolean, note: string | null) {
  await vdb.mockVisitFinding.updateMany({ where: { id, cycleId }, data: { status: done ? "DONE" : "OPEN", doneNote: note, closedAt: done ? new Date() : null } });
}
