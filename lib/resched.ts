import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { courseKeys } from "./curriculumEquivalence";
import { DAYS, blackout, decide, eventConflicts, hh, makeupSlots, rankSlots, type ClassSlot, type SemesterDates, type Status } from "./reschedCore";

// Scheduling from the database: classes of the current timetable (latest finished run of each scope) with their
// batches and teachers; free-slot finding; reschedule requests (Chairman / Dean → Program Lead + teacher, visiting
// teachers must confirm, blackout weeks refused); planned events that hold their slot; force-majeure closures; the
// cohort check for repeaters; CQI flags for the next curriculum revision.

const db = prisma as unknown as Record<string, any>;
export const RESCHED_HINT = "Run prisma/migration_resched.sql in Supabase first.";
type U = { id: string; role: string; name: string };
export type Request = { id: string; chairmanId: string; eventId: string | null; entryId: string; courseId: string; fromDate: Date; fromStart: number; fromEnd: number; toDate: Date; toStart: number; toEnd: number; reason: string; status: Status; visiting: boolean; plOk: boolean | null; facultyOk: boolean | null; deanId: string | null; note: string | null; forceMajeure: boolean; createdById: string; createdAt: Date };

export async function classSlots(chairmanId: string): Promise<ClassSlot[]> {
  const runs = await prisma.timetableRun.findMany({ where: { chairmanId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, scopeKey: true } });
  const latest = new Map<string, string>();
  for (const r of runs) if (!latest.has(r.scopeKey || "")) latest.set(r.scopeKey || "", r.id);
  if (!latest.size) return [];
  const es = await prisma.timetableEntry.findMany({ where: { timetableRunId: { in: Array.from(latest.values()) } }, select: { id: true, dayOfWeek: true, startHour: true, endHour: true, scheduleSection: { select: { id: true, instructorId: true, courseId: true, course: { select: { code: true, batchId: true } }, group: { select: { name: true, members: { select: { course: { select: { id: true, batchId: true } } } } } } } } } });
  const covers = (await db.scheduleSectionCover.findMany({ where: { scheduleSectionId: { in: es.map((e) => e.scheduleSection.id).concat("none") } }, select: { scheduleSectionId: true, batchId: true } }).catch(() => [])) as { scheduleSectionId: string; batchId: string }[];
  return es.map((e) => {
    const s = e.scheduleSection;
    const batches = Array.from(new Set([...(s.course?.batchId ? [s.course.batchId] : []), ...(s.group?.members.map((m) => m.course.batchId).filter((x): x is string => !!x) || []), ...covers.filter((c) => c.scheduleSectionId === s.id).map((c) => c.batchId)]));
    return { entryId: e.id, courseId: s.courseId || s.group?.members[0]?.course.id || "", code: s.course?.code || s.group?.name || "Class", batchIds: batches, day: e.dayOfWeek.slice(0, 3), start: e.startHour, end: e.endHour, instructorId: s.instructorId };
  });
}
export async function batchesOf(chairmanId: string) {
  return prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "asc" }] });
}
/** Semester dates of a course's program and term (Program Lead's dates, else the academic calendar). */
export async function semesterDates(courseId: string): Promise<SemesterDates> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinatorId: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } }, batch: { select: { degreeProgram: true } } } });
  if (!c) return { semesterStart: null, midtermStart: null, finalStart: null };
  const sd = c.batch && c.offeredTermName && c.offeredTermYear ? await prisma.semesterDates.findUnique({ where: { coordinatorId_degreeProgram_termName_termYear: { coordinatorId: c.coordinatorId, degreeProgram: c.batch.degreeProgram, termName: c.offeredTermName, termYear: c.offeredTermYear } } }).catch(() => null) : null;
  if (sd?.midtermStartDate || sd?.finalStartDate) return { semesterStart: sd.semesterStartDate, midtermStart: sd.midtermStartDate, finalStart: sd.finalStartDate };
  const cal = await prisma.academicCalendarEntry.findMany({ where: { chairmanId: c.coordinator.managedById || "", kind: { in: ["MIDTERM", "FINAL", "SEMESTER_START"] }, ...(c.offeredTermYear ? { termYear: c.offeredTermYear } : {}) }, orderBy: { startDate: "desc" } }).catch(() => []);
  return { semesterStart: cal.find((x) => x.kind === "SEMESTER_START")?.startDate || null, midtermStart: cal.find((x) => x.kind === "MIDTERM")?.startDate || null, finalStart: cal.find((x) => x.kind === "FINAL")?.startDate || null };
}
export async function isVisiting(userId: string | null) {
  if (!userId) return false;
  const [u, p] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { isVisitingPlaceholder: true } }), prisma.facultyProfile.findUnique({ where: { userId }, select: { employmentType: true } }).catch(() => null)]);
  return !!u?.isVisitingPlaceholder || /visiting/i.test(p?.employmentType || "");
}

const dateOnly = (s: string) => { const d = new Date(`${s}T00:00:00Z`); if (isNaN(+d)) throw new Error("Choose the date."); return d; };
/** A request to move one class (one date) to a new date and time — from an organiser, for an event or otherwise. */
export async function requestMove(user: U, chairmanId: string, r: { entryId: string; fromDate: string; toDate: string; toStart: number; toEnd?: number; reason: string; eventId?: string | null }) {
  const slots = await classSlots(chairmanId);
  const c = slots.find((x) => x.entryId === r.entryId);
  if (!c) throw new Error("Choose a class of the current timetable.");
  const from = dateOnly(r.fromDate), to = dateOnly(r.toDate);
  if (DAYS[from.getUTCDay()] !== c.day) throw new Error(`${c.code} is held on ${c.day}s — choose a ${c.day} to move.`);
  if (r.reason.trim().length < 5) throw new Error("Give the reason.");
  const toEnd = r.toEnd ?? r.toStart + (c.end - c.start);
  const why = blackout(to, await semesterDates(c.courseId));
  if (why) throw new Error(`Classes can't be moved into ${why}. Choose another date.`);
  const day = DAYS[to.getUTCDay()];
  const clash = rankSlots(slots.filter((x) => x.entryId !== c.entryId), c.batchIds, { days: [day], from: r.toStart, to: toEnd, length: toEnd - r.toStart, step: 100 })[0];
  const teacherClash = slots.find((x) => x.entryId !== c.entryId && x.day === day && x.instructorId && x.instructorId === c.instructorId && x.start < toEnd && r.toStart < x.end);
  if (clash?.affected.length || teacherClash) throw new Error(`The new time clashes with ${[...(clash?.affected || []), ...(teacherClash ? [teacherClash] : [])].map((x) => `${x.code} (${x.day} ${hh(x.start)})`).join(", ")}.`);
  const id = randomUUID();
  await db.classReschedule.create({ data: { id, chairmanId, eventId: r.eventId || null, entryId: c.entryId, courseId: c.courseId, fromDate: from, fromStart: c.start, fromEnd: c.end, toDate: to, toStart: r.toStart, toEnd, reason: r.reason.trim().slice(0, 500), visiting: await isVisiting(c.instructorId), createdById: user.id } });
  const deans = await prisma.user.findMany({ where: { OR: [{ id: chairmanId }, { managedById: chairmanId, role: "DEAN" }] }, select: { id: true } });
  await notifyUsers(deans.map((d) => d.id), { kind: "REQUEST", title: `Reschedule request: ${c.code} ${r.fromDate} → ${r.toDate} ${hh(r.toStart)}`, body: r.reason.slice(0, 200), href: "/scheduling?tab=requests", exceptId: user.id }).catch(() => null);
  return id;
}
export async function requestsOf(chairmanId: string) {
  return (await db.classReschedule.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 300 }).catch(() => [])) as Request[];
}
/** A decision by the Chairman / Dean, the Program Lead or the teacher. */
export async function decideRequest(user: U, chairmanId: string, id: string, ok: boolean, note: string) {
  const r = (await db.classReschedule.findUnique({ where: { id } })) as Request | null;
  if (!r || r.chairmanId !== chairmanId) throw new Error("Not found.");
  const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true, coordinatorId: true, instructorId: true } });
  const slot = (await classSlots(chairmanId)).find((x) => x.entryId === r.entryId);
  const teacher = slot?.instructorId || c?.instructorId || null;
  const who = r.status === "PENDING_DEAN" ? (["CHAIRMAN", "DEAN"].includes(user.role) ? "DEAN" : null) : user.id === teacher ? "FACULTY" : user.id === c?.coordinatorId ? "PL" : null;
  if (!who) throw new Error(r.status === "PENDING_DEAN" ? "The Chairman / Dean reviews it first." : "Only the Program Lead or the course's teacher answers now.");
  if (!ok && note.trim().length < 3) throw new Error("Give the reason.");
  const n = decide({ status: r.status, visiting: r.visiting, plOk: r.plOk, facultyOk: r.facultyOk }, who, ok);
  await db.classReschedule.update({ where: { id }, data: { status: n.status, plOk: n.plOk, facultyOk: n.facultyOk, ...(who === "DEAN" ? { deanId: user.id } : {}), note: note.trim().slice(0, 500) || r.note, updatedAt: new Date() } });
  const line = `${c?.code} ${r.fromDate.toISOString().slice(0, 10)} → ${r.toDate.toISOString().slice(0, 10)} ${hh(r.toStart)}`;
  if (n.status === "PROVISIONAL" && who === "DEAN") await notifyUsers([c?.coordinatorId, teacher], { kind: "REQUEST", title: `Please confirm: ${line}`, body: r.visiting ? "You are teaching as visiting faculty — the class moves only if you confirm you can come." : r.reason.slice(0, 200), href: "/scheduling?tab=requests" }).catch(() => null);
  if (n.status === "APPROVED") await tellStudents(r.courseId, chairmanId, `${c?.code} moved: ${r.fromDate.toISOString().slice(0, 10)} ${hh(r.fromStart)} → ${r.toDate.toISOString().slice(0, 10)} ${hh(r.toStart)}–${hh(r.toEnd)}`, r.reason);
  if (["APPROVED", "REJECTED", "BLOCKED"].includes(n.status)) await notifyUsers([r.createdById, c?.coordinatorId, teacher], { kind: "REQUEST", title: `${n.status === "APPROVED" ? "Class moved" : n.status === "BLOCKED" ? "Reschedule blocked" : "Reschedule declined"}: ${line}`, body: n.message, href: "/scheduling?tab=requests", exceptId: user.id }).catch(() => null);
  return n.message;
}

/** A flag is resolved once the revision has dealt with it (logged). */
export async function resolveFlag(user: { id: string; role: string }, chairmanId: string, id: string) {
  const f = await db.cqiRevisionFlag.findUnique({ where: { id } });
  if (!f || (user.role !== "SUPER_USER" && f.chairmanId !== chairmanId)) throw new Error("Not found.");
  if (!["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role)) throw new Error("The curriculum team resolves CQI flags.");
  await db.cqiRevisionFlag.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: user.id } });
  await writeAuditLog({ actorUserId: user.id, action: "CQI_FLAG_RESOLVED", entityType: "CqiRevisionFlag", entityId: id, metadata: { course: f.courseCode, plo: f.ploLabel } });
}

/** The course's students hear that their class moved. */
async function tellStudents(courseId: string, chairmanId: string, title: string, body: string) {
  const en = await prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { studentId: true } });
  if (!en.length) return;
  const { notifyStudents } = await import("./studentNotices");
  await notifyStudents(en.map((e) => e.studentId), { kind: "TIMETABLE", title, body: body.slice(0, 200), href: "/student/timetable" }, chairmanId).catch(() => null);
}

// ---- events and closures
export async function addEvent(user: U, chairmanId: string, e: { title: string; date: string; start: number; end: number; batchIds: string[] }) {
  if (!e.title.trim()) throw new Error("Name the event.");
  if (!(e.end > e.start)) throw new Error("The event must end after it starts.");
  const published = await prisma.timetableRun.count({ where: { chairmanId, status: "COMPLETED" } });
  await db.plannedEvent.create({ data: { id: randomUUID(), chairmanId, title: e.title.trim().slice(0, 200), date: dateOnly(e.date), startHour: e.start, endHour: e.end, batchIdsJson: JSON.stringify(e.batchIds), beforePublication: published === 0, createdById: user.id } });
}
export async function eventsWithConflicts(chairmanId: string) {
  const [events, slots] = await Promise.all([db.plannedEvent.findMany({ where: { chairmanId }, orderBy: { date: "asc" } }).catch(() => []) as Promise<{ id: string; title: string; date: Date; startHour: number; endHour: number; batchIdsJson: string; beforePublication: boolean }[]>, classSlots(chairmanId)]);
  const conflicts = eventConflicts(events.map((e) => ({ id: e.id, title: e.title, day: DAYS[new Date(e.date).getUTCDay()], start: e.startHour, end: e.endHour, batchIds: JSON.parse(e.batchIdsJson || "[]") })), slots);
  return { events, conflicts };
}
/** Force majeure: the Dean / Registrar declares a closure; every class of that day moves to a make-up slot, no consent chain. */
export async function forceMajeure(user: U, chairmanId: string, date: string, reason: string) {
  if (!["CHAIRMAN", "DEAN"].includes(user.role)) throw new Error("Only the Dean or the Registrar declares a campus closure.");
  if (reason.trim().length < 3) throw new Error("Give the reason.");
  const d = dateOnly(date);
  const slots = await classSlots(chairmanId);
  const onDay = slots.filter((c) => c.day === DAYS[d.getUTCDay()]);
  const plan = makeupSlots(d, onDay, slots, onDay[0] ? await semesterDates(onDay[0].courseId) : { semesterStart: null, midtermStart: null, finalStart: null });
  await db.campusClosure.create({ data: { id: randomUUID(), chairmanId, date: d, reason: reason.trim().slice(0, 300), declaredById: user.id } });
  await prisma.academicCalendarEntry.create({ data: { chairmanId, kind: "HOLIDAY", title: `Campus closed: ${reason.trim().slice(0, 100)}`, startDate: d, createdById: user.id } }).catch(() => null);
  for (const p of plan.plan) {
    const c = onDay.find((x) => x.entryId === p.entryId)!;
    await db.classReschedule.create({ data: { id: randomUUID(), chairmanId, entryId: c.entryId, courseId: c.courseId, fromDate: d, fromStart: c.start, fromEnd: c.end, toDate: dateOnly(p.date), toStart: p.start, toEnd: p.end, reason: `Force majeure: ${reason.trim().slice(0, 200)}`, status: "APPROVED", forceMajeure: true, deanId: user.id, createdById: user.id } });
    await tellStudents(c.courseId, chairmanId, `Campus closed ${date}: ${c.code} make-up class ${p.date} ${hh(p.start)}–${hh(p.end)}`, reason);
  }
  const teachers = Array.from(new Set(onDay.map((c) => c.instructorId)));
  await notifyUsers(teachers, { kind: "REQUEST", title: `Campus closed ${date} — your classes moved to make-up slots`, body: reason.slice(0, 200), href: "/scheduling?tab=requests" }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "CAMPUS_CLOSURE_DECLARED", entityType: "CampusClosure", entityId: chairmanId, metadata: { date, moved: plan.plan.length, unplaced: plan.unplaced.length } });
  return plan;
}

// ---- cohort lock and CQI
/** Students in a course outside their own batch (repeaters, out-of-batch): the course of their batch's curriculum it stands for. */
export async function cohortCheck(chairmanId: string) {
  const en = await prisma.studentEnrollment.findMany({ where: { status: { not: "WITHDRAWN" }, course: { isOffered: true, coordinator: { managedById: chairmanId } } }, select: { isRepeat: true, student: { select: { id: true, rollNumber: true, name: true, batchId: true } }, course: { select: { id: true, code: true, title: true, batchId: true } } }, take: 5000 });
  const out = en.filter((e) => e.course.batchId && e.student.batchId !== e.course.batchId);
  const own = await prisma.course.findMany({ where: { batchId: { in: Array.from(new Set(out.map((e) => e.student.batchId))).concat("none") } }, select: { batchId: true, code: true, title: true } });
  const groups = (await prisma.courseEquivalenceMember.findMany({ where: { courseId: { in: out.map((e) => e.course.id).concat("none") } }, select: { courseId: true, group: { select: { members: { select: { course: { select: { code: true, batchId: true } } } } } } } }).catch(() => []));
  return out.map((e) => {
    const g = groups.find((x) => x.courseId === e.course.id)?.group.members.find((m) => m.course.batchId === e.student.batchId)?.course.code;
    const keys = new Set(courseKeys(e.course.title, null));
    const byTitle = own.find((c) => c.batchId === e.student.batchId && courseKeys(c.title, null).some((k) => keys.has(k)));
    return { roll: e.student.rollNumber, name: e.student.name, repeat: e.isRepeat, taking: `${e.course.code} ${e.course.title}`, mapsTo: g || byTitle?.code || null, via: g ? "Course Equivalence" : byTitle ? "same course in their curriculum" : null };
  });
}
/** After results are approved: a PLO whose attainment in this course is below 50% flags it for the next curriculum revision. */
export async function flagLowPlo(courseId: string) {
  const { computeCloPloPassRates } = await import("./resultMate");
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, batchId: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } } } });
  if (!c) return 0;
  const r = await computeCloPloPassRates(courseId).catch(() => null);
  if (!r?.studentCount) return 0;
  let n = 0;
  for (const p of r.ploStats) {
    if (!p.maxWeight) continue;
    const att = Math.round((1000 * p.passCount) / r.studentCount) / 10;
    if (att >= 50) continue;
    await db.cqiRevisionFlag.upsert({ where: { courseId_ploLabel: { courseId, ploLabel: p.label } }, create: { id: randomUUID(), chairmanId: c.coordinator.managedById || "", courseId, courseCode: c.code, courseTitle: c.title, batchId: c.batchId, ploLabel: p.label, attainment: att, termName: c.offeredTermName, termYear: c.offeredTermYear }, update: { attainment: att, resolvedAt: null } });
    n++;
  }
  return n;
}
/** Open CQI flags of an institute (null: every institute — for a national revision). */
export async function revisionFlags(chairmanId: string | null, titles?: string[]) {
  const rows = (await db.cqiRevisionFlag.findMany({ where: { ...(chairmanId ? { chairmanId } : {}), resolvedAt: null }, orderBy: { attainment: "asc" }, take: 500 }).catch(() => [])) as { id: string; chairmanId: string; courseCode: string; courseTitle: string; ploLabel: string; attainment: number; termName: string | null; termYear: number | null }[];
  if (!titles) return rows;
  const t = new Set(titles.map((x) => x.toLowerCase()));
  return rows.filter((r) => t.has(r.courseTitle.toLowerCase()));
}

/**
 * Cohort lock for transcripts: a student from another batch (a repeater, an out-of-batch student) is recorded under the
 * course of his own batch's curriculum it maps to — Course Equivalence first, then the same course by name — so his
 * transcript keeps his curriculum's code. Unmapped students keep the course as taught.
 */
export async function ownCurriculumCourses(courseId: string, studentIds: string[]) {
  const out = new Map<string, { code: string; title: string }>();
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { batchId: true, title: true } });
  if (!c?.batchId || !studentIds.length) return out;
  const studs = await prisma.student.findMany({ where: { id: { in: studentIds }, batchId: { not: c.batchId } }, select: { id: true, batchId: true } });
  if (!studs.length) return out;
  const batches = Array.from(new Set(studs.map((s) => s.batchId)));
  const [own, grp] = await Promise.all([
    prisma.course.findMany({ where: { batchId: { in: batches } }, select: { batchId: true, code: true, title: true } }),
    prisma.courseEquivalenceMember.findFirst({ where: { courseId }, select: { group: { select: { members: { select: { course: { select: { batchId: true, code: true, title: true } } } } } } } }).catch(() => null),
  ]);
  const keys = new Set(courseKeys(c.title, null));
  for (const s of studs) {
    const eq = grp?.group.members.find((m) => m.course.batchId === s.batchId)?.course;
    const same = own.find((x) => x.batchId === s.batchId && courseKeys(x.title, null).some((k) => keys.has(k)));
    const hit = eq || same;
    if (hit) out.set(s.id, { code: hit.code, title: hit.title });
  }
  return out;
}
