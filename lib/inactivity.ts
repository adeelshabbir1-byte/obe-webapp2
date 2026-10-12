import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { awayInTerm, currentTermOf } from "./facultyLeave";

// Sign-in watch: someone who has not opened the app for N working days has not seen their tasks either. Their boss
// (Program Lead, department Chairman, or the Institute Head for people who report to them) is told once per absence,
// and the person gets an email too. Weekends, holidays/breaks in the academic calendar, approved short leave and
// semester-long leave don't count. Each boss sets their own limit (default: the Institute Head's, else 3 working days).

export const idb = prisma as unknown as Record<string, any>;
export type PolicyRow = { id: string; chairmanId: string; bossId: string; workingDays: number; offDaysJson: string; exemptIds: string[]; updatedAt: Date };
export const WATCHERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];
export const DEFAULT_DAYS = 3;
export const DEFAULT_OFF = [0, 6]; // Sunday, Saturday
// Calendar days are counted in the institute's local time (Pakistan, UTC+5, unless APP_TZ_OFFSET_MINUTES says otherwise).
const TZ_MS = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 300) * 60000;
const local = (d: Date) => new Date(d.getTime() + TZ_MS);
export const dayKey = (d: Date) => local(d).toISOString().slice(0, 10);

export { touchActivity } from "./activity";

/** Last time each person used the app: tracked activity, else their latest sign-in, else when the account was made. */
export async function lastSeenOf(users: { id: string; createdAt: Date }[]) {
  const ids = users.map((u) => u.id);
  const out = new Map<string, { at: Date; never: boolean }>();
  if (!ids.length) return out;
  const [act, ses] = await Promise.all([
    (idb.userActivity?.findMany({ where: { userId: { in: ids } }, select: { userId: true, lastSeenAt: true } }) ?? Promise.resolve([])).catch(() => []) as Promise<{ userId: string; lastSeenAt: Date }[]>,
    prisma.session.groupBy({ by: ["userId"], where: { userId: { in: ids }, mfaVerified: true }, _max: { createdAt: true } }),
  ]);
  const a = new Map(act.map((x) => [x.userId, new Date(x.lastSeenAt)]));
  const s = new Map(ses.map((x) => [x.userId, x._max.createdAt ? new Date(x._max.createdAt) : null]));
  for (const u of users) {
    const seen = [a.get(u.id), s.get(u.id)].filter((x): x is Date => !!x).sort((p, q) => q.getTime() - p.getTime())[0];
    out.set(u.id, seen ? { at: seen, never: false } : { at: new Date(u.createdAt), never: true });
  }
  return out;
}

// ---- settings ----------------------------------------------------------------------------------------------------
export async function policyFor(chairmanId: string, bossId: string) {
  let rows: PolicyRow[] = [], missing = false;
  try { rows = (await idb.inactivityPolicy.findMany({ where: { chairmanId, bossId: { in: [bossId, chairmanId] } } })) as PolicyRow[]; } catch { missing = true; }
  const own = rows.find((r) => r.bossId === bossId);
  const inst = rows.find((r) => r.bossId === chairmanId);
  let offDays = DEFAULT_OFF;
  try { if (inst) offDays = (JSON.parse(inst.offDaysJson) as number[]).filter((n) => n >= 0 && n <= 6); } catch { /* keep default */ }
  return { workingDays: own ? own.workingDays : inst ? inst.workingDays : DEFAULT_DAYS, ownSet: !!own, instituteDays: inst ? inst.workingDays : DEFAULT_DAYS, offDays, exemptIds: own?.exemptIds || [], missing };
}

// ---- who watches whom --------------------------------------------------------------------------------------------
type Boss = { id: string; role: string; departmentId: string | null; managedById: string | null };
type Member = { id: string; name: string; role: string; departmentId: string | null; createdAt: Date; managedById: string | null };
const MEMBER = { id: true, name: true, role: true, departmentId: true, createdAt: true, managedById: true } as const;

/** People a boss is alerted about. Program Lead: the people they manage. Department Chairman: everyone in the
 * department. Institute Head: the people who report to them directly (the rest have a nearer boss). With `all`,
 * the Institute Head gets the whole institute (for the page, not for alerts). */
export async function teamOf(boss: Boss, chairmanId: string, all = false): Promise<Member[]> {
  const inInstitute = { OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] };
  let where: Record<string, unknown>;
  if (boss.role === "PROGRAM_COORDINATOR") where = { managedById: boss.id };
  else if (boss.role === "HEAD_OF_DEPARTMENT") {
    if (!boss.departmentId) return [];
    where = { departmentId: boss.departmentId, ...inInstitute };
  } else if (boss.role === "CHAIRMAN") where = all ? inInstitute : { managedById: boss.id };
  else return [];
  const rows = (await prisma.user.findMany({ where: { ...where, isActive: true, id: { not: boss.id }, role: { notIn: ["SUPER_USER", "CHAIRMAN"] } } as never, select: MEMBER, orderBy: { name: "asc" }, take: 3000 })) as unknown as Member[];
  return rows;
}

// ---- counting working days ---------------------------------------------------------------------------------------
async function holidaysOf(chairmanId: string, from: Date) {
  const cal = await prisma.academicCalendarEntry.findMany({ where: { chairmanId, kind: { in: ["HOLIDAY", "BREAK"] }, OR: [{ endDate: { gte: from } }, { startDate: { gte: from } }] }, select: { startDate: true, endDate: true } });
  const out = new Set<string>();
  for (const c of cal) for (let d = new Date(c.startDate), n = 0; d <= (c.endDate || c.startDate) && n < 400; d = new Date(d.getTime() + 86400000), n++) out.add(dayKey(d));
  return out;
}
async function shortLeaveDays(ids: string[], from: Date) {
  const out = new Map<string, Set<string>>();
  if (!ids.length) return out;
  const rows = (await (idb.shortLeave?.findMany({ where: { userId: { in: ids }, status: "APPROVED", toDate: { gte: from } }, select: { userId: true, fromDate: true, toDate: true } }) ?? Promise.resolve([])).catch(() => [])) as { userId: string; fromDate: Date; toDate: Date }[];
  for (const r of rows) {
    const set = out.get(r.userId) || new Set<string>();
    for (let d = new Date(r.fromDate), n = 0; d <= new Date(r.toDate) && n < 120; d = new Date(d.getTime() + 86400000), n++) set.add(dayKey(d));
    out.set(r.userId, set);
  }
  return out;
}
/** Whole working days missed since the last visit: the days after it, up to yesterday (today isn't over yet). */
export function workingDaysSince(last: Date, now: Date, offDays: number[], skip: (key: string) => boolean) {
  const start = local(last); start.setUTCHours(0, 0, 0, 0);
  const today = local(now); today.setUTCHours(0, 0, 0, 0);
  let n = 0;
  for (let d = new Date(start.getTime() + 86400000), i = 0; d < today && i < 370; d = new Date(d.getTime() + 86400000), i++) {
    if (offDays.includes(d.getUTCDay())) continue;
    if (skip(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}

// ---- the team's standing -----------------------------------------------------------------------------------------
export type Standing = { id: string; name: string; role: string; lastSeen: Date; never: boolean; days: number; state: "OK" | "OVER" | "ON_LEAVE" | "LONG_LEAVE" | "EXEMPT"; onLeaveToday: boolean; openTasks: number; overdue: number; alertedAt: Date | null };

export async function standingOf(members: Member[], chairmanId: string, bossId: string, now = new Date()) {
  const policy = await policyFor(chairmanId, bossId);
  const ids = members.map((m) => m.id);
  const seen = await lastSeenOf(members);
  const earliest = new Date(Math.min(now.getTime(), ...Array.from(seen.values()).map((s) => s.at.getTime())));
  const [hol, leave, longAway, tasks, alerts] = await Promise.all([
    holidaysOf(chairmanId, earliest),
    shortLeaveDays(ids, earliest),
    currentTermOf(chairmanId).then((t) => awayInTerm(ids, t)),
    openTasksOf(ids, now),
    (idb.inactivityAlert?.findMany({ where: { bossId, userId: { in: ids } }, select: { userId: true, lastSeenAt: true, createdAt: true } }) ?? Promise.resolve([])).catch(() => []) as Promise<{ userId: string; lastSeenAt: Date; createdAt: Date }[]>,
  ]);
  const todayKey = dayKey(now);
  const rows: Standing[] = members.map((m) => {
    const s = seen.get(m.id)!;
    const lv = leave.get(m.id);
    const days = workingDaysSince(s.at, now, policy.offDays, (k) => hol.has(k) || !!lv?.has(k));
    const alert = alerts.find((a) => a.userId === m.id && new Date(a.lastSeenAt).getTime() === s.at.getTime());
    const onLeaveToday = !!lv?.has(todayKey);
    const state: Standing["state"] = longAway.has(m.id) ? "LONG_LEAVE" : policy.exemptIds.includes(m.id) ? "EXEMPT" : onLeaveToday ? "ON_LEAVE" : policy.workingDays > 0 && days >= policy.workingDays ? "OVER" : "OK";
    const t = tasks.get(m.id) || { open: 0, overdue: 0 };
    return { id: m.id, name: m.name, role: m.role, lastSeen: s.at, never: s.never, days, state, onLeaveToday, openTasks: t.open, overdue: t.overdue, alertedAt: alert ? new Date(alert.createdAt) : null };
  });
  return { policy, rows };
}

/** Open tasks per person: deadlines named to them, and deadlines of courses where they hold the role the task is for. */
async function openTasksOf(ids: string[], now: Date) {
  const out = new Map<string, { open: number; overdue: number }>();
  if (!ids.length) return out;
  const add = (id: string, due: Date) => { const e = out.get(id) || { open: 0, overdue: 0 }; e.open++; if (due < now) e.overdue++; out.set(id, e); };
  const named = (await prisma.deadline.findMany({ where: { assigneeId: { in: ids }, completedAt: null, allCourses: false } as never, select: { assigneeId: true, dueDate: true }, take: 20000 })) as unknown as { assigneeId: string; dueDate: Date }[];
  for (const d of named) add(d.assigneeId, d.dueDate);
  const courses = await prisma.course.findMany({ where: { OR: [{ instructorId: { in: ids } }, { subjectExpertId: { in: ids } }] }, select: { id: true, instructorId: true, subjectExpertId: true }, take: 5000 });
  if (courses.length) {
    const byCourse = new Map(courses.map((c) => [c.id, c]));
    const rows = (await prisma.deadline.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, assigneeId: null, completedAt: null, allCourses: false, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } as never, select: { courseId: true, role: true, dueDate: true }, take: 20000 })) as unknown as { courseId: string; role: string; dueDate: Date }[];
    for (const d of rows) {
      const c = byCourse.get(d.courseId);
      const who = d.role === "INSTRUCTOR" ? c?.instructorId : c?.subjectExpertId;
      if (who && ids.includes(who)) add(who, d.dueDate);
    }
  }
  return out;
}

// ---- alerts ------------------------------------------------------------------------------------------------------
const fmt = (d: Date) => local(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Tell one boss about each person over their limit — once per absence. The person is emailed once per absence too. */
export async function checkBoss(boss: Boss & { name: string }, chairmanId: string, now = new Date()) {
  const members = await teamOf(boss, chairmanId);
  if (!members.length) return 0;
  const { policy, rows } = await standingOf(members, chairmanId, boss.id, now);
  if (policy.missing || policy.workingDays <= 0) return 0;
  let sent = 0;
  for (const r of rows.filter((x) => x.state === "OVER" && !x.alertedAt)) {
    try {
      await idb.inactivityAlert.create({ data: { chairmanId, bossId: boss.id, userId: r.id, lastSeenAt: r.lastSeen, workingDays: r.days } });
    } catch { continue; } // already sent (unique per boss, person and absence) or the table is missing
    const tasks = r.openTasks ? ` ${r.openTasks} open task(s)${r.overdue ? `, ${r.overdue} overdue` : ""}.` : " No open tasks on record.";
    const since = r.never ? `has never signed in (account made ${fmt(r.lastSeen)})` : `has not signed in for ${r.days} working days (last seen ${fmt(r.lastSeen)})`;
    await notifyUsers([boss.id], { kind: "INACTIVITY", title: `${r.name} ${r.never ? "has never signed in" : `hasn't signed in for ${r.days} working days`}`, body: `${r.name} ${since}, so they have not seen their tasks either.${tasks} They are not on approved leave.`, href: "/inactivity" });
    sent++;
    // The person hears once per absence, however many bosses were told.
    const already = (await idb.inactivityAlert.count({ where: { userId: r.id, lastSeenAt: r.lastSeen } }).catch(() => 2)) as number;
    if (already <= 1) await notifyUsers([r.id], { kind: "INACTIVITY", title: `You haven't signed in for ${r.days} working days`, body: `Your tasks are waiting in the app.${tasks} ${boss.name} has been told. If you are on leave, ask for it to be recorded so this doesn't happen.`, href: "/deadlines" });
  }
  return sent;
}

/** The daily run: every Institute Head, department Chairman and Program Lead. */
export async function runInactivityCheck(now = new Date()) {
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
  let sent = 0;
  for (const h of heads) {
    const bosses = (await prisma.user.findMany({ where: { isActive: true, OR: [{ id: h.id }, { role: { in: ["HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"] }, managedById: h.id }] } as never, select: { id: true, name: true, role: true, departmentId: true, managedById: true } })) as unknown as (Boss & { name: string })[];
    for (const b of bosses) sent += await checkBoss(b, h.id, now).catch(() => 0);
  }
  return sent;
}
