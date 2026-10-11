import { prisma } from "./db";
import { examDays, scheduleExams, allocateRooms, assignInvigilators, type Group } from "./examPlanner";

// Exam sessions in the database: loading, generating the date sheet, allocating rooms / seats / invigilators, and
// checking for problems. The two tables are new, so they are reached through an untyped handle.

export const xdb = prisma as unknown as Record<string, any>;
export type ExamSessionRow = {
  id: string; chairmanId: string; name: string; examType: string; startDate: Date; endDate: Date; slotsJson: string; offDaysJson: string;
  maxPerDay: number; seatPercent: number; invigilatorsPerRoom: number; includeLabs: boolean; status: string; createdById: string; createdAt: Date;
};
export type ExamPaperRow = { id: string; sessionId: string; courseId: string; date: Date | null; slot: number | null; pinned: boolean; roomsJson: string; invigilatorsJson: string };
export const EXAM_MANAGERS = ["CHAIRMAN"];
export const EXAM_VIEWERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function loadSession(id: string) {
  return (await xdb.examSession.findUnique({ where: { id } })) as ExamSessionRow | null;
}

/** Days of the session (holidays and breaks from the academic calendar are skipped). */
export async function sessionDays(s: ExamSessionRow) {
  const cal = await prisma.academicCalendarEntry.findMany({ where: { chairmanId: s.chairmanId, kind: { in: ["HOLIDAY", "BREAK"] }, startDate: { lte: s.endDate } }, select: { startDate: true, endDate: true } });
  const hol = new Set<string>();
  for (const c of cal) { const e = c.endDate || c.startDate; for (const d = new Date(c.startDate); d <= e; d.setUTCDate(d.getUTCDate() + 1)) hol.add(iso(d)); }
  return examDays(new Date(s.startDate), new Date(s.endDate), parse<number[]>(s.offDaysJson, [0]), hol);
}

/** Offered courses of the institute with students — one paper each. Adds missing papers, removes ones no longer offered (if not placed by hand). */
export async function syncPapers(s: ExamSessionRow) {
  const courses = await prisma.course.findMany({
    where: { isOffered: true, coordinator: { managedById: s.chairmanId }, ...(s.includeLabs ? {} : { NOT: { courseType: "Lab" } }), studentEnrollments: { some: { status: { not: "WITHDRAWN" } } } },
    select: { id: true },
  });
  const ids = new Set(courses.map((c) => c.id));
  const papers = (await xdb.examPaper.findMany({ where: { sessionId: s.id } })) as ExamPaperRow[];
  const have = new Set(papers.map((p) => p.courseId));
  const add = Array.from(ids).filter((id) => !have.has(id));
  if (add.length) await xdb.examPaper.createMany({ data: add.map((courseId) => ({ sessionId: s.id, courseId })), skipDuplicates: true });
  const drop = papers.filter((p) => !ids.has(p.courseId) && !p.pinned).map((p) => p.id);
  if (drop.length) await xdb.examPaper.deleteMany({ where: { id: { in: drop } } });
}

/** Everything the planner needs about the session's papers. */
export async function paperData(sessionId: string) {
  const papers = (await xdb.examPaper.findMany({ where: { sessionId } })) as ExamPaperRow[];
  const courses = await prisma.course.findMany({
    where: { id: { in: papers.map((p) => p.courseId) } },
    select: { id: true, code: true, title: true, courseType: true, instructorId: true, batch: { select: { degreeProgram: true, batchName: true } }, studentEnrollments: { where: { status: { not: "WITHDRAWN" } }, select: { studentId: true } } },
  });
  const cOf = new Map(courses.map((c) => [c.id, c]));
  return { papers, cOf };
}

const groupKey = (code: string) => code.trim().toUpperCase();

/** Make the date sheet. Papers placed by hand stay; everything else is (re)placed. Then rooms and invigilators. */
export async function generate(sessionId: string) {
  const s = await loadSession(sessionId);
  if (!s) return { error: "not found" };
  await syncPapers(s);
  const days = await sessionDays(s);
  const slots = parse<string[]>(s.slotsJson, []);
  if (!days.length || !slots.length) return { error: "The session has no exam days or time slots." };
  const { papers, cOf } = await paperData(sessionId);
  const rooms = await examRooms(s);
  const seatsPerSlot = rooms.reduce((n, r) => n + r.seats, 0);
  const dayIndex = new Map(days.map((d, i) => [iso(d), i]));
  const groups = new Map<string, Group>();
  for (const p of papers) {
    const c = cOf.get(p.courseId); if (!c) continue;
    const k = groupKey(c.code);
    const g = groups.get(k) || { key: k, courseIds: [], students: [], instructorIds: [], pinned: null };
    g.courseIds.push(c.id);
    for (const e of c.studentEnrollments) if (!g.students.includes(e.studentId)) g.students.push(e.studentId);
    if (c.instructorId && !g.instructorIds.includes(c.instructorId)) g.instructorIds.push(c.instructorId);
    if (p.pinned && p.date && p.slot !== null && dayIndex.has(iso(new Date(p.date)))) g.pinned = { day: dayIndex.get(iso(new Date(p.date)))!, slot: p.slot };
    groups.set(k, g);
  }
  const r = scheduleExams(Array.from(groups.values()), days.length, slots.length, s.maxPerDay, seatsPerSlot || Number.MAX_SAFE_INTEGER);
  for (const g of Array.from(groups.values())) {
    const p = r.placed.get(g.key);
    await xdb.examPaper.updateMany({ where: { sessionId, courseId: { in: g.courseIds } }, data: p ? { date: days[p.day], slot: p.slot } : { date: null, slot: null, pinned: false } });
  }
  await allocate(sessionId);
  return { ok: true, placed: r.placed.size, unplaced: r.unplaced.length };
}

export async function examRooms(s: ExamSessionRow) {
  const rooms = await prisma.room.findMany({ where: { chairmanId: s.chairmanId, type: "LECTURE" }, select: { id: true, name: true, capacity: true } });
  return rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, seats: Math.floor((r.capacity * s.seatPercent) / 100) }));
}

/** People who can invigilate: active teaching staff of the institute. */
export async function invigilatorPool(chairmanId: string) {
  const leads = await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" as never }, select: { id: true } });
  const users = await prisma.user.findMany({
    where: { isActive: true, canTeach: true, isVisitingPlaceholder: false, managedById: { in: [chairmanId, ...leads.map((l) => l.id)] }, OR: [{ role: "INSTRUCTOR" }, { secondaryRole: "INSTRUCTOR" }, { tertiaryRole: "INSTRUCTOR" }, { role: "SUBJECT_EXPERT" }] } as never,
    select: { id: true, name: true },
  });
  return users;
}

/** Rooms, seats and invigilators for every slot, from the dates already set. */
export async function allocate(sessionId: string) {
  const s = await loadSession(sessionId);
  if (!s) return;
  const { papers, cOf } = await paperData(sessionId);
  const rooms = await examRooms(s);
  const pool = (await invigilatorPool(s.chairmanId)).map((u) => u.id);
  const bySlot = new Map<string, ExamPaperRow[]>();
  for (const p of papers) if (p.date && p.slot !== null) { const k = `${iso(new Date(p.date))}:${p.slot}`; bySlot.set(k, [...(bySlot.get(k) || []), p]); }
  const roomPlan = new Map<string, Map<string, { roomId: string; studentIds: string[] }[]>>(); // slot -> paperId -> rooms
  const slotRooms: { key: string; rooms: { roomId: string; instructorIds: string[] }[] }[] = [];
  for (const [k, ps] of Array.from(bySlot.entries()).sort()) {
    const al = allocateRooms(ps.map((p) => ({ courseId: p.courseId, students: (cOf.get(p.courseId)?.studentEnrollments || []).map((e) => e.studentId) })), rooms);
    const perPaper = new Map<string, { roomId: string; studentIds: string[] }[]>();
    for (const u of al.uses) {
      const byCourse = new Map<string, string[]>();
      for (const st of u.students) byCourse.set(st.courseId, [...(byCourse.get(st.courseId) || []), st.studentId]);
      for (const [courseId, ids] of Array.from(byCourse.entries())) {
        const p = ps.find((x) => x.courseId === courseId)!;
        perPaper.set(p.id, [...(perPaper.get(p.id) || []), { roomId: u.roomId, studentIds: ids }]);
      }
    }
    roomPlan.set(k, perPaper);
    slotRooms.push({ key: k, rooms: al.uses.map((u) => ({ roomId: u.roomId, instructorIds: Array.from(new Set(u.students.map((x) => cOf.get(x.courseId)?.instructorId).filter((x): x is string => !!x))) })) });
  }
  const inv = assignInvigilators(slotRooms, pool, Math.max(1, s.invigilatorsPerRoom));
  for (const p of papers) {
    if (!p.date || p.slot === null) { await xdb.examPaper.update({ where: { id: p.id }, data: { roomsJson: "[]", invigilatorsJson: "[]" } }); continue; }
    const k = `${iso(new Date(p.date))}:${p.slot}`;
    const rs = roomPlan.get(k)?.get(p.id) || [];
    const invs = rs.map((r) => ({ roomId: r.roomId, userIds: inv.bySlot.get(k)?.get(r.roomId) || [] }));
    await xdb.examPaper.update({ where: { id: p.id }, data: { roomsJson: JSON.stringify(rs), invigilatorsJson: JSON.stringify(invs) } });
  }
}

/** Problems in the current plan: unscheduled papers, student clashes, too many papers a day, students without a seat, rooms without invigilators. */
export async function examIssues(s: ExamSessionRow) {
  const { papers, cOf } = await paperData(s.id);
  const out: { level: "bad" | "warn"; text: string }[] = [];
  const unsched = papers.filter((p) => !p.date || p.slot === null);
  if (unsched.length) out.push({ level: "bad", text: `${unsched.length} paper(s) have no date: ${unsched.slice(0, 12).map((p) => cOf.get(p.courseId)?.code).join(", ")}${unsched.length > 12 ? "…" : ""}. Add days or slots, or move papers by hand.` });
  const slotOf = new Map<string, string[]>(), dayOf = new Map<string, number>();
  let clashes = 0, heavy = 0, unseated = 0, noInv = 0;
  for (const p of papers) {
    if (!p.date || p.slot === null) continue;
    const d = iso(new Date(p.date)), k = `${d}:${p.slot}`;
    const studs = (cOf.get(p.courseId)?.studentEnrollments || []).map((e) => e.studentId);
    for (const st of studs) {
      const a = slotOf.get(`${st}|${k}`) || [];
      if (a.length && !a.includes(cOf.get(p.courseId)!.code)) clashes++;
      slotOf.set(`${st}|${k}`, [...a, cOf.get(p.courseId)!.code]);
      dayOf.set(`${st}|${d}`, (dayOf.get(`${st}|${d}`) || 0) + 1);
    }
    const rs = parse<{ roomId: string; studentIds: string[] }[]>(p.roomsJson, []);
    unseated += studs.length - rs.reduce((n, r) => n + r.studentIds.length, 0);
    noInv += parse<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, []).filter((x) => !x.userIds.length).length;
  }
  for (const v of Array.from(dayOf.values())) if (v > s.maxPerDay) heavy++;
  if (clashes) out.push({ level: "bad", text: `${clashes} student clash(es): a student has two papers at the same time.` });
  if (heavy) out.push({ level: "warn", text: `${heavy} student-day(s) with more than ${s.maxPerDay} papers.` });
  if (unseated) out.push({ level: "bad", text: `${unseated} student seat(s) could not be given a room — add rooms, raise the seat % or add a slot.` });
  if (noInv) out.push({ level: "warn", text: `${noInv} room(s) have no invigilator — not enough teaching staff free in those slots.` });
  return out;
}

/** Session settings from the form, checked. */
export function readSettings(b: Record<string, unknown>) {
  const slots = (Array.isArray(b.slots) ? b.slots : String(b.slots || "").split(/[\n,]+/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  const offDays = (Array.isArray(b.offDays) ? b.offDays : [0]).map(Number).filter((n) => n >= 0 && n <= 6);
  const start = new Date(String(b.startDate)), end = new Date(String(b.endDate));
  const n = (v: unknown, d: number, lo: number, hi: number) => { const x = parseInt(String(v ?? ""), 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  if (!String(b.name || "").trim()) return { error: "Give the session a name, e.g. Midterm Fall 2026." };
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { error: "Choose a start and an end date (end on or after start)." };
  if (!slots.length) return { error: "Add at least one time slot, e.g. 09:00-11:00." };
  return { data: {
    name: String(b.name).trim().slice(0, 120), examType: b.examType === "Final" ? "Final" : "Midterm", startDate: start, endDate: end,
    slotsJson: JSON.stringify(slots), offDaysJson: JSON.stringify(offDays), maxPerDay: n(b.maxPerDay, 2, 1, 4), seatPercent: n(b.seatPercent, 50, 10, 100),
    invigilatorsPerRoom: n(b.invigilatorsPerRoom, 1, 1, 4), includeLabs: !!b.includeLabs,
  } };
}

