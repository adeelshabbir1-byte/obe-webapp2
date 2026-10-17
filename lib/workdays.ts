import { prisma } from "./db";

// Working days for planning: weekends (institute setting, default Saturday + Sunday) and holidays / breaks from the
// Academic Calendar are skipped. Used by the FYP planner and to move university deadlines off holidays.
const DAY = 86400000;
export type WorkCal = { off: Set<string>; weekend: number[]; names: Map<string, string> };
const key = (d: Date) => d.toISOString().slice(0, 10);
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function workCalendar(chairmanId: string): Promise<WorkCal> {
  const rows = await prisma.academicCalendarEntry.findMany({ where: { chairmanId, kind: { in: ["HOLIDAY", "BREAK", "WEEKEND"] } } }).catch(() => []);
  const off = new Set<string>(), names = new Map<string, string>();
  let weekend = [0, 6];
  for (const r of rows) {
    if (r.kind === "WEEKEND") { const w = r.title.split(",").map(Number).filter((n) => n >= 0 && n <= 6); if (w.length) weekend = w; continue; }
    for (let t = utc(r.startDate).getTime(); t <= utc(r.endDate || r.startDate).getTime(); t += DAY) { const k = key(new Date(t)); off.add(k); names.set(k, r.title); }
  }
  return { off, weekend, names };
}
export const isWorkday = (cal: WorkCal, d: Date) => !cal.weekend.includes(d.getUTCDay()) && !cal.off.has(key(d));
export function nextWorkday(cal: WorkCal, d: Date) { let t = utc(d); for (let i = 0; i < 400 && !isWorkday(cal, t); i++) t = new Date(t.getTime() + DAY); return t; }
/** The date on which a task that starts on `start` and needs `n` working days ends (start counts as day 1). */
export function addWorkdays(cal: WorkCal, start: Date, n: number) { let t = nextWorkday(cal, start), left = Math.max(1, n) - 1; while (left > 0) { t = new Date(t.getTime() + DAY); if (isWorkday(cal, t)) left--; } return t; }
export function workdaysBetween(cal: WorkCal, a: Date, b: Date): number { let n = 0; for (let t = utc(a).getTime() + DAY; t <= utc(b).getTime(); t += DAY) if (isWorkday(cal, new Date(t))) n++; return a <= b ? n : -workdaysBetween(cal, b, a); }
export function prevWorkday(cal: WorkCal, d: Date) { let t = utc(d); for (let i = 0; i < 400 && !isWorkday(cal, t); i++) t = new Date(t.getTime() - DAY); return t; }
export const holidayName = (cal: WorkCal, d: Date) => cal.names.get(key(d)) || (cal.weekend.includes(d.getUTCDay()) ? "weekend" : null);

/** A deadline that falls on a weekend or holiday moves to the next working day. */
export async function shiftToWorkday(chairmanId: string, d: Date) { return nextWorkday(await workCalendar(chairmanId), d); }

// Pakistan public holidays. Islamic dates follow the moon and are approximate until announced — adjust them in the Academic Calendar.
const FIXED: [string, string][] = [["02-05", "Kashmir Solidarity Day"], ["03-23", "Pakistan Day"], ["05-01", "Labour Day"], ["05-28", "Youm-e-Takbeer"], ["08-14", "Independence Day"], ["11-09", "Iqbal Day"], ["12-25", "Quaid-e-Azam Day"]];
const LUNAR: Record<number, [string, string, number][]> = {
  2026: [["03-20", "Eid ul Fitr (approx.)", 3], ["05-27", "Eid ul Adha (approx.)", 3], ["06-25", "Ashura (approx.)", 2], ["08-26", "Eid Milad-un-Nabi (approx.)", 1]],
  2027: [["03-10", "Eid ul Fitr (approx.)", 3], ["05-16", "Eid ul Adha (approx.)", 3], ["06-14", "Ashura (approx.)", 2], ["08-15", "Eid Milad-un-Nabi (approx.)", 1]],
  2028: [["02-27", "Eid ul Fitr (approx.)", 3], ["05-05", "Eid ul Adha (approx.)", 3], ["06-03", "Ashura (approx.)", 2], ["08-04", "Eid Milad-un-Nabi (approx.)", 1]],
};
export function pakistanHolidays(year: number) {
  return [...FIXED.map(([md, t]) => ({ title: t, start: new Date(`${year}-${md}T00:00:00Z`), days: 1 })), ...(LUNAR[year] || []).map(([md, t, n]) => ({ title: t, start: new Date(`${year}-${md}T00:00:00Z`), days: n }))];
}
