import { prisma } from "./db";
import { getTimetableEntries, timeRangeLabel, type TimetableEntryView } from "./timetableView";
import { invigilatorPool } from "./exams";
import { leavesOf } from "./facultyLeave";
import { termIndex } from "./termLogic";
import { approverFor } from "./approvers";

// Short leave (a few days): the teacher's classes in those days come from the current timetable; each gets covered by
// a substitute (someone free at that time), a make-up class, or is cancelled. Holidays in the academic calendar are skipped.

export const sdb = prisma as unknown as Record<string, any>;
export type ShortLeaveRow = { id: string; userId: string; chairmanId: string; fromDate: Date; toDate: Date; reason: string; status: string; approverId: string | null; decidedAt: Date | null; decisionNote: string | null; createdAt: Date };
export type SubRow = { id: string; leaveId: string; chairmanId: string; date: Date; entryId: string; courseCode: string; courseTitle: string; sectionLabel: string; timeLabel: string; roomName: string; originalId: string; plan: string; substituteId: string | null; status: string; makeupDate: Date | null; topic: string | null; note: string | null };
export const LEAVE_APPROVERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function holidays(chairmanId: string, from: Date, to: Date) {
  const cal = await prisma.academicCalendarEntry.findMany({ where: { chairmanId, kind: { in: ["HOLIDAY", "BREAK"] }, startDate: { lte: to } }, select: { startDate: true, endDate: true } });
  const out = new Set<string>();
  for (const c of cal) { const e = c.endDate || c.startDate; if (e < from) continue; for (const d = new Date(c.startDate); d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.add(ymd(d)); }
  return out;
}

/** Every class of this teacher between the two dates (from the current timetable), skipping holidays. */
export async function classesInRange(userId: string, chairmanId: string, from: Date, to: Date) {
  const entries = (await getTimetableEntries(chairmanId)).filter((e) => e.instructorId === userId);
  const hol = await holidays(chairmanId, from, to);
  const out: { date: Date; entry: TimetableEntryView }[] = [];
  for (const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); d <= to && out.length < 200; d.setUTCDate(d.getUTCDate() + 1)) {
    if (hol.has(ymd(d))) continue;
    for (const e of entries) if (e.dayOfWeek === WD[d.getUTCDay()]) out.push({ date: new Date(d), entry: e });
  }
  return out;
}

/** Who should decide: the teacher's department Chairman (Head of Department), otherwise the Institute Head. */
export async function approversForTeacher(userId: string, chairmanId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  // The department's Chairman/HoD — or whoever acts for them or covers the position (lib/approvers.ts).
  const ids = (await approverFor(chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: u?.departmentId })).ids.filter((id) => id !== userId);
  return ids.length ? ids : [chairmanId];
}

/** Teachers free for a class: no class of their own overlapping it, not on leave that day; same course first, then same department, then fewest substitutions. */
export async function substituteOptions(chairmanId: string, date: Date, entry: { dayOfWeek: string; startHour: number; endHour: number; courseCode: string; instructorId: string }) {
  const [pool, all, onShort, subs] = await Promise.all([
    invigilatorPool(chairmanId),
    getTimetableEntries(chairmanId),
    sdb.shortLeave.findMany({ where: { chairmanId, status: "APPROVED", fromDate: { lte: date }, toDate: { gte: date } }, select: { userId: true } }).catch(() => []) as Promise<{ userId: string }[]>,
    sdb.substituteClass.groupBy({ by: ["substituteId"], where: { chairmanId, substituteId: { not: null }, status: { in: ["ASSIGNED", "ACCEPTED", "DONE"] } }, _count: { _all: true } }).catch(() => []) as Promise<{ substituteId: string; _count: { _all: number } }[]>,
  ]);
  const term = date.getUTCMonth() >= 7 ? termIndex("Fall", date.getUTCFullYear()) : termIndex("Spring", date.getUTCFullYear());
  const longAway = new Set((await leavesOf(pool.map((p) => p.id))).filter((l) => term >= l.fromTerm && (l.toTerm === null || term <= l.toTerm)).map((l) => l.userId));
  const busy = new Set(all.filter((e) => e.dayOfWeek === entry.dayOfWeek && e.startHour < entry.endHour && entry.startHour < e.endHour).map((e) => e.instructorId));
  const sameCourse = new Set(all.filter((e) => e.courseCode === entry.courseCode).map((e) => e.instructorId));
  const teacher = await prisma.user.findUnique({ where: { id: entry.instructorId }, select: { departmentId: true } });
  const dept = new Map((await prisma.user.findMany({ where: { id: { in: pool.map((p) => p.id) } }, select: { id: true, departmentId: true } })).map((u) => [u.id, u.departmentId]));
  const count = new Map(subs.map((s) => [s.substituteId, s._count._all]));
  const away = new Set(onShort.map((s) => s.userId));
  return pool
    .filter((p) => p.id !== entry.instructorId && !busy.has(p.id) && !away.has(p.id) && !longAway.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, sameCourse: sameCourse.has(p.id), sameDept: !!teacher?.departmentId && dept.get(p.id) === teacher.departmentId, done: count.get(p.id) || 0 }))
    .sort((a, b) => Number(b.sameCourse) - Number(a.sameCourse) || Number(b.sameDept) - Number(a.sameDept) || a.done - b.done || a.name.localeCompare(b.name))
    .slice(0, 25);
}

/** Make (or refresh) the class rows of a leave from the timetable. Rows already arranged are kept. */
export async function syncClasses(l: ShortLeaveRow) {
  const list = await classesInRange(l.userId, l.chairmanId, new Date(l.fromDate), new Date(l.toDate));
  for (const { date, entry } of list) {
    await sdb.substituteClass.upsert({
      where: { leaveId_entryId_date: { leaveId: l.id, entryId: entry.id, date } },
      update: {},
      create: { leaveId: l.id, chairmanId: l.chairmanId, date, entryId: entry.id, courseCode: entry.courseCode, courseTitle: entry.courseTitle, sectionLabel: entry.sectionLabel, timeLabel: timeRangeLabel(entry.startHour, entry.endHour), roomName: entry.roomName, originalId: l.userId },
    });
  }
  return list.length;
}

/** May this user decide the leave and arrange its classes? The Institute Head, or the teacher's department Chairman. */
export async function canDecideLeave(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }, l: ShortLeaveRow) {
  if (user.id === l.userId) return false;
  if (user.role === "CHAIRMAN") return l.chairmanId === user.id;
  // Acting for the Chairman/HoD, or covering the position while it is vacant or switched off.
  if ((await approversForTeacher(l.userId, l.chairmanId)).includes(user.id)) return true;
  if (user.role !== "HEAD_OF_DEPARTMENT" || user.managedById !== l.chairmanId) return false;
  const t = await prisma.user.findUnique({ where: { id: l.userId }, select: { departmentId: true } });
  return !!t?.departmentId && t.departmentId === user.departmentId;
}
