import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { notifyStudents } from "./studentNotices";
import { writeAuditLog } from "./audit";

// Counselling appointments. A student books a time with their batch advisor or one of the student counsellors that
// Student Affairs designates. Counsellors publish weekly slots (or take requests). The advisor can call a student in;
// the student then picks a slot. Visit notes are confidential: only the counsellor who wrote them can read them (and
// the student's batch advisor, for academic notes). Reports give counts only, never names, and feed the program
// evidence (NCEAC criterion 4, NBEAC Form 3) automatically.

export const cdb = prisma as unknown as Record<string, any>;
export const COUNSEL_HINT = "Run prisma/migration_counselling.sql in Supabase first.";
export const KINDS: Record<string, string> = { ACADEMIC: "Academic", CAREER: "Career", PERSONAL: "Personal / psychological" };
export const MODES: Record<string, string> = { IN_PERSON: "In person", ONLINE: "Online", EITHER: "In person or online" };
export const STATUS: Record<string, string> = { REQUESTED: "Asked for a time", CALLED_IN: "Called in — pick a time", BOOKED: "Booked", DONE: "Held", CANCELLED: "Cancelled", NO_SHOW: "Did not come" };
const EVIDENCE_KIND: Record<string, string> = { ACADEMIC: "Academic counselling", CAREER: "Career counselling", PERSONAL: "Other support" };

export type Slot = { id: string; chairmanId: string; counsellorId: string; startsAt: Date; endsAt: Date; mode: string; place: string | null };
export type Booking = { id: string; chairmanId: string; studentId: string; counsellorId: string; slotId: string | null; kind: string; mode: string; startsAt: Date | null; status: string; reason: string | null; source: string; calledById: string | null; reminderSentAt: Date | null; doneAt: Date | null; followUpDate: Date | null; createdAt: Date };
export type Counsellor = { id: string; name: string; as: string; byRequest: boolean };

async function chairmanOfStudent(studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, batchId: true, batch: { select: { advisorId: true, coordinator: { select: { managedById: true } } } } } });
  return s ? { student: s, chairmanId: s.batch.coordinator?.managedById || "", advisorId: s.batch.advisorId } : null;
}

/** Who a student can see: their batch advisor and the designated student counsellors of the institute. */
export async function counsellorsFor(studentId: string): Promise<Counsellor[]> {
  const c = await chairmanOfStudent(studentId);
  if (!c) return [];
  const profiles = (await cdb.counsellorProfile.findMany({ where: { chairmanId: c.chairmanId } }).catch(() => [])) as { userId: string; isCounsellor: boolean; byRequest: boolean }[];
  const ids = Array.from(new Set([...(c.advisorId ? [c.advisorId] : []), ...profiles.filter((p) => p.isCounsellor).map((p) => p.userId)]));
  const users = await prisma.user.findMany({ where: { id: { in: ids.concat(["none"]) }, isActive: true }, select: { id: true, name: true } });
  return ids.map((id) => { const u = users.find((x) => x.id === id); return u ? { id, name: u.name, as: id === c.advisorId ? "Batch advisor" : "Student counsellor", byRequest: !!profiles.find((p) => p.userId === id)?.byRequest } : null; }).filter((x): x is Counsellor => !!x);
}

/** Does this member of staff counsel (a batch advisor, or a designated counsellor)? */
export async function counsels(userId: string, chairmanId: string) {
  const [advises, prof] = await Promise.all([prisma.batch.count({ where: { advisorId: userId } }), cdb.counsellorProfile.findUnique({ where: { userId } }).catch(() => null)]);
  return advises > 0 || (!!prof?.isCounsellor && prof.chairmanId === chairmanId);
}
/** May this counsellor see this student (their advisee, or any student of the institute for a designated counsellor)? */
export async function mayCounsel(userId: string, studentId: string) {
  const c = await chairmanOfStudent(studentId);
  if (!c) return false;
  if (c.advisorId === userId) return true;
  const prof = await cdb.counsellorProfile.findUnique({ where: { userId } }).catch(() => null);
  return !!prof?.isCounsellor && prof.chairmanId === c.chairmanId;
}

/** Publish the same time every week for some weeks (no duplicates of a slot already there). */
export async function publishSlots(counsellorId: string, chairmanId: string, o: { firstDate: Date; time: string; minutes: number; count: number; weeks: number; mode: string; place: string | null }) {
  const [h, m] = o.time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error("Give the time as HH:MM.");
  const existing = new Set(((await cdb.counsellingSlot.findMany({ where: { counsellorId, startsAt: { gte: o.firstDate } }, select: { startsAt: true } })) as { startsAt: Date }[]).map((s) => new Date(s.startsAt).getTime()));
  const rows: Slot[] = [];
  for (let w = 0; w < Math.min(o.weeks, 16); w++) for (let i = 0; i < Math.min(o.count, 12); i++) {
    const start = new Date(o.firstDate); start.setHours(h, m + i * o.minutes, 0, 0); start.setDate(start.getDate() + 7 * w);
    if (start.getTime() < Date.now() || existing.has(start.getTime())) continue;
    rows.push({ id: randomUUID(), chairmanId, counsellorId, startsAt: start, endsAt: new Date(start.getTime() + o.minutes * 60_000), mode: o.mode, place: o.place });
  }
  if (rows.length) await cdb.counsellingSlot.createMany({ data: rows });
  return rows.length;
}

/** Free slots of these counsellors in the next four weeks. */
export async function openSlots(counsellorIds: string[], days = 28): Promise<Slot[]> {
  const now = new Date();
  const slots = (await cdb.counsellingSlot.findMany({ where: { counsellorId: { in: counsellorIds.concat(["none"]) }, startsAt: { gte: now, lte: new Date(now.getTime() + days * 864e5) } }, orderBy: { startsAt: "asc" } }).catch(() => [])) as Slot[];
  const taken = new Set(((await cdb.counsellingBooking.findMany({ where: { slotId: { in: slots.map((s) => s.id).concat(["none"]) }, status: { in: ["BOOKED", "DONE"] } }, select: { slotId: true } }).catch(() => [])) as { slotId: string }[]).map((b) => b.slotId));
  return slots.filter((s) => !taken.has(s.id));
}

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** A student books a free slot (taking up a call-in from the same counsellor, if there is one). */
export async function book(studentId: string, studentName: string, slotId: string, kind: string, mode: string, reason: string) {
  const slot = (await cdb.counsellingSlot.findUnique({ where: { id: slotId } })) as Slot | null;
  if (!slot || new Date(slot.startsAt) < new Date()) throw new Error("This time is no longer available.");
  if (!(await counsellorsFor(studentId)).some((c) => c.id === slot.counsellorId)) throw new Error("You can book only your advisor or a student counsellor.");
  if (await cdb.counsellingBooking.count({ where: { slotId, status: { in: ["BOOKED", "DONE"] } } })) throw new Error("Someone has just booked this time. Pick another.");
  const k = KINDS[kind] ? kind : "ACADEMIC";
  const m = slot.mode === "EITHER" ? (mode === "ONLINE" ? "ONLINE" : "IN_PERSON") : slot.mode;
  const called = (await cdb.counsellingBooking.findFirst({ where: { studentId, counsellorId: slot.counsellorId, status: "CALLED_IN" } })) as Booking | null;
  const data = { slotId, kind: called?.kind || k, mode: m, startsAt: slot.startsAt, status: "BOOKED", reason: reason.slice(0, 500) || called?.reason || null };
  let id: string;
  try {
    if (called) { await cdb.counsellingBooking.update({ where: { id: called.id }, data }); id = called.id; }
    else { id = randomUUID(); await cdb.counsellingBooking.create({ data: { id, chairmanId: slot.chairmanId, studentId, counsellorId: slot.counsellorId, source: "SELF", ...data } }); }
  } catch { throw new Error("Someone has just booked this time. Pick another."); }
  await notifyUsers([slot.counsellorId], { kind: "COUNSELLING", title: `Counselling booked: ${studentName}, ${when(slot.startsAt)}`, body: `${KINDS[data.kind]} · ${MODES[m]}${slot.place ? ` · ${slot.place}` : ""}`, href: "/counselling" });
  await notifyStudents([studentId], { kind: "COUNSELLING", title: `Counselling booked for ${when(slot.startsAt)}`, body: `${MODES[m]}${slot.place ? ` · ${slot.place}` : ""}. You will get a reminder the day before.`, href: "/student/counselling" }, slot.chairmanId);
  return id;
}

/** For counsellors who take requests: the student asks for a time; the counsellor then sets it. */
export async function requestTime(studentId: string, studentName: string, counsellorId: string, kind: string, mode: string, reason: string) {
  const c = (await counsellorsFor(studentId)).find((x) => x.id === counsellorId);
  if (!c) throw new Error("You can ask only your advisor or a student counsellor.");
  const info = await chairmanOfStudent(studentId);
  if (await cdb.counsellingBooking.count({ where: { studentId, counsellorId, status: "REQUESTED" } })) throw new Error("You have already asked; they will send you a time.");
  const id = randomUUID();
  await cdb.counsellingBooking.create({ data: { id, chairmanId: info!.chairmanId, studentId, counsellorId, kind: KINDS[kind] ? kind : "ACADEMIC", mode: MODES[mode] ? mode : "IN_PERSON", status: "REQUESTED", reason: reason.slice(0, 500) || null, source: "SELF" } });
  await notifyUsers([counsellorId], { kind: "COUNSELLING", title: `${studentName} asks for a counselling time`, body: reason.slice(0, 200), href: "/counselling" });
  return id;
}

/** The advisor (or a counsellor) calls a student in: the student is told to pick a time. */
export async function callIn(by: { id: string; name: string }, studentId: string, kind: string, reason: string, source: string) {
  if (!(await mayCounsel(by.id, studentId))) throw new Error("You can call in only your advisees (or, as a student counsellor, students of your institute).");
  if (await cdb.counsellingBooking.count({ where: { studentId, counsellorId: by.id, status: { in: ["CALLED_IN", "REQUESTED"] } } })) throw new Error("This student has already been called in.");
  const info = await chairmanOfStudent(studentId);
  const id = randomUUID();
  await cdb.counsellingBooking.create({ data: { id, chairmanId: info!.chairmanId, studentId, counsellorId: by.id, kind: KINDS[kind] ? kind : "ACADEMIC", status: "CALLED_IN", reason: reason.slice(0, 500) || null, source: ["EARLY_WARNING", "HOLD"].includes(source) ? source : "CALL_IN", calledById: by.id } });
  await notifyStudents([studentId], { kind: "COUNSELLING", title: `${by.name} would like to see you`, body: `Please pick a counselling time.${reason ? ` ${reason.slice(0, 160)}` : ""}`, href: "/student/counselling" }, info!.chairmanId);
  await writeAuditLog({ actorUserId: by.id, action: "COUNSELLING_CALL_IN", entityType: "Student", entityId: studentId, metadata: { source } });
  return id;
}

/** The counsellor sets the time of a request (or of a call-in, on the student's behalf). */
export async function schedule(by: { id: string }, bookingId: string, startsAt: Date, mode: string, place: string | null) {
  const b = (await cdb.counsellingBooking.findUnique({ where: { id: bookingId } })) as Booking | null;
  if (!b || b.counsellorId !== by.id || !["REQUESTED", "CALLED_IN"].includes(b.status)) throw new Error("Not found.");
  if (startsAt < new Date()) throw new Error("Choose a time in the future.");
  const slotId = randomUUID();
  await cdb.counsellingSlot.create({ data: { id: slotId, chairmanId: b.chairmanId, counsellorId: by.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), mode: MODES[mode] ? mode : b.mode, place } });
  await cdb.counsellingBooking.update({ where: { id: b.id }, data: { slotId, startsAt, status: "BOOKED", mode: MODES[mode] ? mode : b.mode } });
  await notifyStudents([b.studentId], { kind: "COUNSELLING", title: `Counselling time set: ${when(startsAt)}`, body: `${MODES[mode] || ""}${place ? ` · ${place}` : ""}`, href: "/student/counselling" }, b.chairmanId);
}

export async function cancel(by: { kind: "student" | "staff"; id: string; name: string }, bookingId: string, reason: string) {
  const b = (await cdb.counsellingBooking.findUnique({ where: { id: bookingId } })) as Booking | null;
  if (!b || (by.kind === "student" ? b.studentId !== by.id : b.counsellorId !== by.id)) throw new Error("Not found.");
  if (!["REQUESTED", "CALLED_IN", "BOOKED"].includes(b.status)) throw new Error("This booking can no longer be cancelled.");
  await cdb.counsellingBooking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
  if (by.kind === "student") await notifyUsers([b.counsellorId], { kind: "COUNSELLING", title: `Counselling cancelled by ${by.name}`, body: b.startsAt ? when(b.startsAt) : reason.slice(0, 200), href: "/counselling" });
  else await notifyStudents([b.studentId], { kind: "COUNSELLING", title: "Your counselling booking was cancelled", body: `${by.name}${reason ? `: ${reason.slice(0, 200)}` : ""}. Please pick another time.`, href: "/student/counselling" }, b.chairmanId);
}

/** Record the visit: held (with a confidential note and a follow-up date) or did not come. */
export async function complete(by: { id: string }, bookingId: string, o: { held: boolean; kind: string; notes: string; followUp: Date | null }) {
  const b = (await cdb.counsellingBooking.findUnique({ where: { id: bookingId } })) as Booking | null;
  if (!b || b.counsellorId !== by.id || !["BOOKED", "DONE"].includes(b.status)) throw new Error("Not found.");
  const kind = KINDS[o.kind] ? o.kind : b.kind;
  await cdb.counsellingBooking.update({ where: { id: b.id }, data: { status: o.held ? "DONE" : "NO_SHOW", kind, doneAt: new Date(), followUpDate: o.followUp } });
  if (o.held && o.notes.trim()) await cdb.counsellingNote.create({ data: { id: randomUUID(), bookingId: b.id, authorId: by.id, kind, notes: o.notes.trim().slice(0, 8000) } });
  if (o.followUp) await notifyStudents([b.studentId], { kind: "COUNSELLING", title: "Follow-up counselling", body: `Please book a follow-up around ${new Date(o.followUp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, href: "/student/counselling" }, b.chairmanId);
  await writeAuditLog({ actorUserId: by.id, action: o.held ? "COUNSELLING_HELD" : "COUNSELLING_NO_SHOW", entityType: "CounsellingBooking", entityId: b.id, metadata: { kind } }); // no content in the log
  await syncEvidence(b.chairmanId).catch(() => {});
}

/** Notes this person may read: their own, and academic notes about their advisees. */
export async function readableNotes(userId: string, bookingIds: string[]) {
  const notes = (await cdb.counsellingNote.findMany({ where: { bookingId: { in: bookingIds.concat(["none"]) } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as { id: string; bookingId: string; authorId: string; kind: string; notes: string; createdAt: Date }[];
  if (!notes.length) return [];
  const bookings = (await cdb.counsellingBooking.findMany({ where: { id: { in: Array.from(new Set(notes.map((n) => n.bookingId))) } }, select: { id: true, studentId: true } })) as { id: string; studentId: string }[];
  const advised = new Set((await prisma.student.findMany({ where: { id: { in: bookings.map((b) => b.studentId) }, batch: { advisorId: userId } }, select: { id: true } })).map((s) => s.id));
  return notes.filter((n) => n.authorId === userId || (n.kind === "ACADEMIC" && advised.has(bookings.find((b) => b.id === n.bookingId)?.studentId || "")));
}

/** Counts only (no names, no content): sessions held by type and month, students served, call-ins, no-shows. */
export async function report(chairmanId: string, year: number, studentIds?: string[]) {
  const rows = (await cdb.counsellingBooking.findMany({ where: { chairmanId, status: { in: ["DONE", "NO_SHOW"] }, doneAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, ...(studentIds ? { studentId: { in: studentIds.concat(["none"]) } } : {}) }, select: { studentId: true, kind: true, status: true, doneAt: true, source: true } }).catch(() => [])) as { studentId: string; kind: string; status: string; doneAt: Date; source: string }[];
  const held = rows.filter((r) => r.status === "DONE");
  const months = Array.from({ length: 12 }, (_, m) => ({ month: new Date(Date.UTC(year, m, 1)).toLocaleDateString("en-GB", { month: "short" }), ...Object.fromEntries(Object.keys(KINDS).map((k) => [k, held.filter((r) => new Date(r.doneAt).getUTCMonth() === m && r.kind === k).length])) })) as ({ month: string } & Record<string, number>)[];
  return { year, held: held.length, students: new Set(held.map((r) => r.studentId)).size, byKind: Object.fromEntries(Object.keys(KINDS).map((k) => [k, held.filter((r) => r.kind === k).length])), noShows: rows.length - held.length, calledIn: held.filter((r) => r.source !== "SELF").length, months };
}

/** Program evidence (COUNSELLING) kept up to date from the sessions held: one record per program, month and type, counts only. */
export async function syncEvidence(chairmanId: string) {
  const year = new Date().getUTCFullYear();
  const rows = (await cdb.counsellingBooking.findMany({ where: { chairmanId, status: "DONE", doneAt: { gte: new Date(Date.UTC(year, 0, 1)) } }, select: { studentId: true, kind: true, doneAt: true } })) as { studentId: string; kind: string; doneAt: Date }[];
  const students = await prisma.student.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.studentId))).concat(["none"]) } }, select: { id: true, batch: { select: { coordinatorId: true } } } });
  const leadOf = new Map(students.map((s) => [s.id, s.batch.coordinatorId]));
  const groups = new Map<string, { lead: string; month: number; kind: string; sessions: number; students: Set<string> }>();
  for (const r of rows) { const lead = leadOf.get(r.studentId); if (!lead) continue; const m = new Date(r.doneAt).getUTCMonth(); const k = `${lead}|${m}|${r.kind}`; const gr = groups.get(k) || { lead, month: m, kind: r.kind, sessions: 0, students: new Set<string>() }; gr.sessions++; gr.students.add(r.studentId); groups.set(k, gr); }
  for (const gr of groups.values()) {
    const monthName = new Date(Date.UTC(year, gr.month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const title = `${KINDS[gr.kind]} counselling sessions — ${monthName}`;
    const data = { coordinatorId: gr.lead, area: "COUNSELLING", kind: EVIDENCE_KIND[gr.kind] || "Other support", title, date: new Date(Date.UTC(year, gr.month, 1)), count: gr.students.size, notes: `${gr.sessions} session(s) with ${gr.students.size} student(s). Counted automatically from Counselling appointments — no names or content.` };
    const old = await prisma.programEvidence.findFirst({ where: { coordinatorId: gr.lead, area: "COUNSELLING", title } });
    if (old) await prisma.programEvidence.update({ where: { id: old.id }, data }); else await prisma.programEvidence.create({ data });
  }
  return groups.size;
}

/** Daily: remind both sides of tomorrow's bookings (once each). */
export async function remindCounselling(now = new Date()) {
  try {
    const due = (await cdb.counsellingBooking.findMany({ where: { status: "BOOKED", reminderSentAt: null, startsAt: { gte: now, lte: new Date(now.getTime() + 30 * 3600_000) } }, take: 1000 })) as Booking[];
    if (!due.length) return 0;
    const names = new Map((await prisma.student.findMany({ where: { id: { in: due.map((d) => d.studentId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    for (const b of due) {
      await notifyUsers([b.counsellorId], { kind: "COUNSELLING", title: `Counselling tomorrow: ${names.get(b.studentId) || "a student"}, ${when(b.startsAt!)}`, href: "/counselling" });
      await notifyStudents([b.studentId], { kind: "COUNSELLING", title: `Reminder: counselling ${when(b.startsAt!)}`, body: MODES[b.mode], href: "/student/counselling" }, b.chairmanId);
      await cdb.counsellingBooking.update({ where: { id: b.id }, data: { reminderSentAt: now } });
    }
    return due.length;
  } catch { return 0; }
}
