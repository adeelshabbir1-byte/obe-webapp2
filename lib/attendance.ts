import { prisma } from "./db";
import { notifyUsers } from "./notifications";

// Attendance rules of an institute, how a percentage is worked out, and the shortage flags.
//
// Statuses kept on AttendanceRecord: PRESENT, LATE, ABSENT and LEAVE (shown as "Excused").
// A student's percentage = attended / counted lectures, where
//   attended = PRESENT (+ LATE, unless the institute counts late as absent)
//   counted  = every marked lecture (− excused ones, if the institute doesn't hold them against the student).
// Defaults keep the original rule (excused leave counts as not attended), so existing figures don't move.

export type AttendancePolicy = {
  minPct: number; lateCountsPresent: boolean; excusedExcluded: boolean; warnMarginPct: number;
  qrPresentMinutes: number; qrLateMinutes: number; qrRotateSeconds: number;
};
export const DEFAULT_POLICY: AttendancePolicy = { minPct: 75, lateCountsPresent: true, excusedExcluded: false, warnMarginPct: 5, qrPresentMinutes: 10, qrLateMinutes: 25, qrRotateSeconds: 12 };

export async function attendancePolicy(chairmanId: string | null | undefined): Promise<AttendancePolicy> {
  if (!chairmanId) return DEFAULT_POLICY;
  const t = await prisma.attendanceThreshold.findUnique({ where: { chairmanId } }).catch(() => null);
  if (!t) return DEFAULT_POLICY;
  return {
    minPct: t.minPercentage, lateCountsPresent: t.lateCountsPresent ?? true, excusedExcluded: t.excusedExcluded ?? false, warnMarginPct: t.warnMarginPct ?? 5,
    qrPresentMinutes: t.qrPresentMinutes ?? 10, qrLateMinutes: t.qrLateMinutes ?? 25, qrRotateSeconds: t.qrRotateSeconds ?? 12,
  };
}

export const STATUS_LABEL: Record<string, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", LEAVE: "Excused" };
export const STATUSES = ["PRESENT", "LATE", "ABSENT", "LEAVE"] as const;

export type Tally = { present: number; late: number; absent: number; excused: number; marked: number };
export function tally(statuses: string[]): Tally {
  const t: Tally = { present: 0, late: 0, absent: 0, excused: 0, marked: 0 };
  for (const s of statuses) {
    if (s === "PRESENT") t.present++; else if (s === "LATE") t.late++; else if (s === "ABSENT") t.absent++; else if (s === "LEAVE") t.excused++; else continue;
    t.marked++;
  }
  return t;
}
const attendedOf = (t: Tally, p: AttendancePolicy) => t.present + (p.lateCountsPresent ? t.late : 0);
const countedOf = (t: Tally, p: AttendancePolicy) => t.marked - (p.excusedExcluded ? t.excused : 0);

/** Percentage to one decimal, or null before anything counts. */
export function percentage(t: Tally, p: AttendancePolicy): number | null {
  const counted = countedOf(t, p);
  return counted > 0 ? Math.round((attendedOf(t, p) / counted) * 1000) / 10 : null;
}

export type Standing = "OK" | "AT_RISK" | "SHORT" | "CANNOT_RECOVER" | "NONE";
export const STANDING_LABEL: Record<Standing, string> = {
  OK: "On track", AT_RISK: "Close to the minimum", SHORT: "Below the minimum", CANNOT_RECOVER: "Can no longer reach the minimum", NONE: "No attendance yet",
};

/**
 * Where a student stands. `remaining` is the number of lectures still to come in the plan: if attending all of them
 * still can't lift the percentage to the minimum, the shortage is certain.
 */
export function standing(t: Tally, p: AttendancePolicy, remaining: number): { pct: number | null; standing: Standing; best: number | null; canMiss: number | null } {
  const pct = percentage(t, p);
  if (pct === null) return { pct, standing: "NONE", best: null, canMiss: null };
  const attended = attendedOf(t, p), counted = countedOf(t, p), left = Math.max(0, remaining);
  const best = Math.round(((attended + left) / (counted + left)) * 1000) / 10;
  // How many of the remaining lectures can be missed and still finish at or above the minimum.
  let canMiss = 0;
  while (canMiss <= left && ((attended + left - canMiss) / (counted + left)) * 100 >= p.minPct) canMiss++;
  canMiss = Math.max(0, canMiss - 1);
  if (best < p.minPct) return { pct, standing: "CANNOT_RECOVER", best, canMiss: 0 };
  if (pct < p.minPct) return { pct, standing: "SHORT", best, canMiss };
  if (pct < p.minPct + p.warnMarginPct) return { pct, standing: "AT_RISK", best, canMiss };
  return { pct, standing: "OK", best, canMiss };
}

export type StudentCourseAttendance = { studentId: string; courseId: string; tally: Tally; pct: number | null; standing: Standing; best: number | null; canMiss: number | null };

/** Per-student attendance of one course (active enrollments), with the course's planned and delivered lectures. */
export async function courseAttendance(courseId: string, p: AttendancePolicy) {
  const [enrollments, records, planned, held] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId, status: "ACTIVE" }, select: { studentId: true, student: { select: { name: true, rollNumber: true } } } }),
    prisma.attendanceRecord.findMany({ where: { courseId }, select: { studentId: true, status: true, lectureRowId: true } }),
    prisma.lectureRow.count({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.lectureRow.count({ where: { courseId, source: "INSTRUCTOR", actualDate: { not: null } } }),
  ]);
  const heldIds = new Set(records.map((r) => r.lectureRowId));
  const remaining = Math.max(0, planned - Math.max(held, heldIds.size));
  const by = new Map<string, string[]>();
  for (const r of records) { const a = by.get(r.studentId) || []; a.push(r.status); by.set(r.studentId, a); }
  const students = enrollments.map((e) => {
    const t = tally(by.get(e.studentId) || []);
    return { studentId: e.studentId, name: e.student.name, rollNumber: e.student.rollNumber, courseId, tally: t, ...standing(t, p, remaining) };
  });
  const pcts = students.map((s) => s.pct).filter((x): x is number => x !== null);
  const average = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
  return { students, planned, held: Math.max(held, heldIds.size), remaining, average };
}

/**
 * Bring the shortage flags of a course up to date. A student newly below the minimum is told about to the Program
 * Lead and the batch advisor once (not again until they recover and fall back).
 */
export async function refreshShortageFlags(courseId: string, chairmanId: string | null) {
  const p = await attendancePolicy(chairmanId);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, coordinatorId: true, batch: { select: { advisorId: true } } } });
  if (!course) return { short: 0, newlyShort: 0 };
  const { students } = await courseAttendance(courseId, p);
  const existing = new Map((await prisma.attendanceFlag.findMany({ where: { courseId } }).catch(() => [])).map((f) => [f.studentId, f]));
  const now = new Date();
  const newly: { name: string; rollNumber: string; pct: number }[] = [];
  for (const s of students) {
    const isShort = s.standing === "SHORT" || s.standing === "CANNOT_RECOVER";
    const f = existing.get(s.studentId);
    if (isShort) {
      if (!f || f.status !== "SHORT") {
        await prisma.attendanceFlag.upsert({
          where: { studentId_courseId: { studentId: s.studentId, courseId } },
          create: { studentId: s.studentId, courseId, chairmanId, status: "SHORT", percentage: s.pct ?? 0, notifiedAt: now },
          update: { status: "SHORT", percentage: s.pct ?? 0, firstFlaggedAt: now, lastCheckedAt: now, notifiedAt: now, clearedAt: null },
        }).catch(() => null);
        newly.push({ name: s.name, rollNumber: s.rollNumber, pct: s.pct ?? 0 });
      } else {
        await prisma.attendanceFlag.update({ where: { id: f.id }, data: { percentage: s.pct ?? 0, lastCheckedAt: now } }).catch(() => null);
      }
    } else if (f && f.status === "SHORT") {
      await prisma.attendanceFlag.update({ where: { id: f.id }, data: { status: "RECOVERED", percentage: s.pct ?? 0, lastCheckedAt: now, clearedAt: now } }).catch(() => null);
    }
  }
  if (newly.length) {
    const list = newly.slice(0, 8).map((n) => `${n.name} (${n.rollNumber}) ${n.pct}%`).join(", ");
    await notifyUsers([course.coordinatorId, course.batch?.advisorId], {
      kind: "ATTENDANCE", title: `Attendance below ${p.minPct}% in ${course.code}: ${newly.length} student${newly.length > 1 ? "s" : ""}`,
      body: `${list}${newly.length > 8 ? ` and ${newly.length - 8} more` : ""}.`, href: "/coordinator/attendance",
    });
  }
  return { short: students.filter((s) => s.standing === "SHORT" || s.standing === "CANNOT_RECOVER").length, newlyShort: newly.length };
}

// ---------------------------------------------------------------------------------------------------- live sessions

export type SessionPhase = "PRESENT" | "LATE" | "CLOSED";
type SessionLike = { id: string; status: string; startedAt: Date; closesAt: Date; presentMinutes: number; lateMinutes: number };

/** What a check-in made now would count as. */
export function phaseOf(s: SessionLike, at = Date.now()): SessionPhase {
  if (s.status !== "OPEN" || at >= s.closesAt.getTime()) return "CLOSED";
  return at - s.startedAt.getTime() < s.presentMinutes * 60_000 ? "PRESENT" : "LATE";
}

/**
 * Close a session: everyone enrolled who has no mark for that lecture becomes ABSENT (an excused or hand-marked
 * status is never overwritten), then the shortage flags are refreshed. Safe to call more than once.
 */
export async function closeSession(sessionId: string, byUserId: string | null) {
  const now = new Date();
  const claimed = await prisma.attendanceSession.updateMany({ where: { id: sessionId, status: "OPEN" }, data: { status: "CLOSED", closedAt: now, closedById: byUserId } });
  if (claimed.count !== 1) return { closed: false, absent: 0 };
  const s = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!s) return { closed: false, absent: 0 };
  const [enrolled, marked] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: s.courseId, status: "ACTIVE" }, select: { studentId: true } }),
    prisma.attendanceRecord.findMany({ where: { lectureRowId: s.lectureRowId }, select: { studentId: true } }),
  ]);
  const has = new Set(marked.map((m) => m.studentId));
  const missing = enrolled.map((e) => e.studentId).filter((id) => !has.has(id));
  if (missing.length) {
    await prisma.attendanceRecord.createMany({ data: missing.map((studentId) => ({ courseId: s.courseId, lectureRowId: s.lectureRowId, studentId, status: "ABSENT", markedById: s.instructorId })), skipDuplicates: true });
    await prisma.attendanceCheckin.createMany({ data: missing.map((studentId) => ({ sessionId: s.id, studentId, status: "ABSENT", method: "AUTO_ABSENT", byUserId: byUserId })), skipDuplicates: true });
  }
  await prisma.attendanceSession.update({ where: { id: s.id }, data: { absentMarked: missing.length } });
  await refreshShortageFlags(s.courseId, s.chairmanId).catch(() => null);
  return { closed: true, absent: missing.length };
}

/** Close every session whose time is up (called when pages and the daily job look at attendance). */
export async function closeDueSessions(where: { courseId?: string; instructorId?: string } = {}) {
  const due = await prisma.attendanceSession.findMany({ where: { ...where, status: "OPEN", closesAt: { lte: new Date() } }, select: { id: true }, take: 50 }).catch(() => []);
  for (const d of due) await closeSession(d.id, null).catch(() => null);
  return due.length;
}

// ---------------------------------------------------------------------------------------------------- reports

export type ShortageRow = { studentId: string; name: string; rollNumber: string; courseId: string; code: string; pct: number; standing: Standing; best: number | null; canMiss: number | null };
export type CourseRow = {
  courseId: string; code: string; title: string; instructor: string; batchId: string | null; batchLabel: string; advisorId: string | null;
  enrolled: number; planned: number; held: number; average: number | null; short: number; atRisk: number; cannotRecover: number; lastMarked: Date | null; qrSessions: number;
};

/** Attendance of many courses at once (a handful of queries, whatever the number of courses) for the reports. */
export async function coursesAttendance(courseIds: string[], p: AttendancePolicy) {
  if (!courseIds.length) return { courses: [] as CourseRow[], shortages: [] as ShortageRow[] };
  const [courses, enrollments, records, planned, held, last, qr] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, code: true, title: true, batchId: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true, advisorId: true } } } }),
    prisma.studentEnrollment.findMany({ where: { courseId: { in: courseIds }, status: "ACTIVE" }, select: { courseId: true, studentId: true, student: { select: { name: true, rollNumber: true } } } }),
    prisma.attendanceRecord.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, studentId: true, status: true, lectureRowId: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds }, source: "INSTRUCTOR" }, _count: { _all: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds }, source: "INSTRUCTOR", actualDate: { not: null } }, _count: { _all: true } }),
    prisma.attendanceRecord.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _max: { updatedAt: true } }),
    prisma.attendanceSession.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }).catch(() => [] as { courseId: string; _count: { _all: number } }[]),
  ]);
  const plannedOf = new Map(planned.map((x) => [x.courseId, x._count._all]));
  const heldOf = new Map(held.map((x) => [x.courseId, x._count._all]));
  const lastOf = new Map(last.map((x) => [x.courseId, x._max.updatedAt]));
  const qrOf = new Map(qr.map((x) => [x.courseId, x._count._all]));
  const recBy = new Map<string, string[]>();
  const lecturesBy = new Map<string, Set<string>>();
  for (const r of records) {
    const k = `${r.courseId}|${r.studentId}`; const a = recBy.get(k) || []; a.push(r.status); recBy.set(k, a);
    const l = lecturesBy.get(r.courseId) || new Set(); l.add(r.lectureRowId); lecturesBy.set(r.courseId, l);
  }
  const shortages: ShortageRow[] = [];
  const rows: CourseRow[] = courses.map((c) => {
    const h = Math.max(heldOf.get(c.id) || 0, lecturesBy.get(c.id)?.size || 0);
    const remaining = Math.max(0, (plannedOf.get(c.id) || 0) - h);
    const mine = enrollments.filter((e) => e.courseId === c.id);
    let short = 0, atRisk = 0, cannot = 0;
    const pcts: number[] = [];
    for (const e of mine) {
      const st = standing(tally(recBy.get(`${c.id}|${e.studentId}`) || []), p, remaining);
      if (st.pct !== null) pcts.push(st.pct);
      if (st.standing === "AT_RISK") atRisk++;
      if (st.standing === "SHORT" || st.standing === "CANNOT_RECOVER") {
        short++; if (st.standing === "CANNOT_RECOVER") cannot++;
        shortages.push({ studentId: e.studentId, name: e.student.name, rollNumber: e.student.rollNumber, courseId: c.id, code: c.code, pct: st.pct ?? 0, standing: st.standing, best: st.best, canMiss: st.canMiss });
      }
    }
    return {
      courseId: c.id, code: c.code, title: c.title, instructor: c.instructor?.name || "", batchId: c.batchId, batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "",
      advisorId: c.batch?.advisorId || null, enrolled: mine.length, planned: plannedOf.get(c.id) || 0, held: h,
      average: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
      short, atRisk, cannotRecover: cannot, lastMarked: lastOf.get(c.id) || null, qrSessions: qrOf.get(c.id) || 0,
    };
  }).sort((a, b) => b.short - a.short || (a.average ?? 101) - (b.average ?? 101));
  shortages.sort((a, b) => a.pct - b.pct);
  return { courses: rows, shortages };
}
