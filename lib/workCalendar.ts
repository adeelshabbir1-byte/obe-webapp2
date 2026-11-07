import { prisma } from "./db";
import { getFlag, setFlag, saveSetting, allStored } from "./scopedSettings";
import { writeAuditLog } from "./audit";
import { dayKey, moveDue, parseDays, type Cal } from "./workDaysCore";

// Personal working days (queue item 22). HR (or the Institute Head until HR is named) sets each person's working
// week and extra off days; the institute's holidays and breaks and the person's approved leave count too. A deadline
// that falls on a day the person does not work moves to their next working day, unless it is a fixed date.
const db = prisma as unknown as Record<string, any>;
const cache = new Map<string, { at: number; cal: Cal }>();
export async function instituteWeek(chairmanId: string) {
  const r = (await allStored(chairmanId).catch(() => [])).find((x) => x.key === "work.days" && x.scopeType === "INSTITUTE");
  return parseDays(r?.value);
}
export async function calendarOf(userId: string, chairmanId: string): Promise<Cal> {
  const k = `${chairmanId}|${userId}`; const c = cache.get(k);
  if (c && Date.now() - c.at < 10 * 60000) return c.cal;
  const from = new Date(Date.now() - 30 * 864e5);
  const [own, offRaw, week, hol, leave] = await Promise.all([
    getFlag(userId, "work.days").catch(() => null), getFlag(userId, "work.off").catch(() => null), instituteWeek(chairmanId),
    prisma.academicCalendarEntry.findMany({ where: { chairmanId, kind: { in: ["HOLIDAY", "BREAK"] }, OR: [{ endDate: { gte: from } }, { startDate: { gte: from } }] }, select: { startDate: true, endDate: true } }).catch(() => []),
    (db.shortLeave?.findMany({ where: { userId, status: "APPROVED", toDate: { gte: from } }, select: { fromDate: true, toDate: true } }) ?? Promise.resolve([])).catch(() => []) as Promise<{ fromDate: Date; toDate: Date }[]>,
  ]);
  const off = new Set<string>();
  const span = (a: Date, b: Date) => { for (let d = new Date(a), n = 0; d <= b && n < 400; d = new Date(d.getTime() + 864e5), n++) off.add(dayKey(d)); };
  for (const h of hol) span(h.startDate, h.endDate || h.startDate);
  for (const l of leave) span(l.fromDate, l.toDate);
  try { for (const x of JSON.parse(offRaw || "[]") as string[]) if (/^\d{4}-\d{2}-\d{2}$/.test(x)) off.add(x); } catch { /* none */ }
  const cal = { days: own ? parseDays(own) : week, off };
  cache.set(k, { at: Date.now(), cal });
  return cal;
}
/** A deadline as this person sees it. */
export async function personalDue(userId: string, chairmanId: string, due: Date, fixed = false) {
  return moveDue(due, await calendarOf(userId, chairmanId), fixed);
}
export const canSetWork = (u: { role: string; extraRoles?: string[] }) => u.role === "CHAIRMAN" || (u.extraRoles || []).includes("HR");
export async function setPattern(actor: { id: string }, chairmanId: string, userIds: string[], days: number[] | null, offDates?: string[]) {
  for (const id of userIds.slice(0, 300)) {
    if (days !== null) await setFlag(id, "work.days", days.length ? days.join(",") : null);
    if (offDates) await setFlag(id, "work.off", offDates.length ? JSON.stringify(offDates.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 200)) : null);
    cache.delete(`${chairmanId}|${id}`);
  }
  await writeAuditLog({ actorUserId: actor.id, action: "WORK_DAYS_SET", entityType: "User", entityId: userIds.slice(0, 20).join(","), metadata: { days: days ? days.join(",") : "unchanged", offDates: offDates ? offDates.length : 0, people: userIds.length } });
}
export async function setInstituteWeek(actor: { id: string }, chairmanId: string, days: number[]) {
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, "work.days", days.join(","), actor.id);
  cache.clear();
}

/** Deadlines marked "fixed date" (exam days, results, HEC / council dates): never moved for anyone. */
export async function fixedIds(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = ((await db.deadlineFixed?.findMany({ where: { deadlineId: { in: ids } } }).catch(() => [])) || []) as { deadlineId: string }[];
  return new Set(rows.map((r) => r.deadlineId));
}
export async function markFixed(id: string) { await db.deadlineFixed?.upsert({ where: { deadlineId: id }, create: { deadlineId: id }, update: {} }).catch(() => null); }
/** Minimum CGPA to graduate (item 16), set by the Controller; falls back to the probation CGPA. */
export async function graduateCgpa(chairmanId: string, fallback: number) {
  const r = (await allStored(chairmanId).catch(() => [])).find((x) => x.key === "rules.graduateCgpa" && x.scopeType === "INSTITUTE");
  const n = Number(r?.value); return Number.isFinite(n) && n > 0 ? n : fallback;
}
