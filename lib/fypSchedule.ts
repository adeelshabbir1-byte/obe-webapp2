import { prisma } from "./db";
import { workCalendar, nextWorkday, addWorkdays, workdaysBetween, prevWorkday, holidayName, type WorkCal } from "./workdays";

const pdb = prisma as unknown as Record<string, any>;
const DAY = 86400000;
type T = { id: string; title: string; ownerId: string | null; ownerText: string | null; startDate: Date; endDate: Date; durationDays: number | null; dependsJson: string | null; fixedStart: boolean; status: string };
const deps = (t: T) => { try { const x = JSON.parse(t.dependsJson || "[]"); return Array.isArray(x) ? (x as string[]) : []; } catch { return []; } };

function topo(tasks: T[]) {
  const byId = new Map(tasks.map((t) => [t.id, t])), seen = new Set<string>(), out: T[] = [], stack = new Set<string>();
  const visit = (t: T) => { if (seen.has(t.id) || stack.has(t.id)) return; stack.add(t.id); for (const d of deps(t)) { const x = byId.get(d); if (x) visit(x); } stack.delete(t.id); seen.add(t.id); out.push(t); };
  [...tasks].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).forEach(visit);
  return out;
}

/** Re-date a plan: each task starts after the tasks it depends on (unless its start is fixed), lasts its working days, skips weekends and holidays. */
export async function reschedule(chairmanId: string, cycleId: string, groupId: string | null) {
  const cal = await workCalendar(chairmanId);
  const tasks = (await pdb.fypPlanTask.findMany({ where: { cycleId, groupId } })) as T[];
  const end = new Map<string, Date>();
  for (const t of topo(tasks)) {
    const d = deps(t).map((x) => end.get(x)).filter((x): x is Date => !!x);
    const after = d.length ? nextWorkday(cal, new Date(Math.max(...d.map((x) => x.getTime())) + DAY)) : null;
    let start = t.fixedStart || !after ? nextWorkday(cal, t.startDate) : after;
    if (t.fixedStart && after && after > start) start = after; // a fixed start can't be before its dependencies finish
    const fin = t.durationDays ? addWorkdays(cal, start, t.durationDays) : new Date(Math.max(start.getTime(), start.getTime() + (t.endDate.getTime() - t.startDate.getTime())));
    end.set(t.id, fin);
    if (start.getTime() !== t.startDate.getTime() || fin.getTime() !== t.endDate.getTime()) await pdb.fypPlanTask.update({ where: { id: t.id }, data: { startDate: start, endDate: fin } });
  }
}

/** Critical path (slack = 0 working days), owner double-bookings and dates on holidays, for display. */
export function analyse(cal: WorkCal, tasks: T[]) {
  const order = topo(tasks), succ = new Map<string, T[]>();
  for (const t of tasks) for (const d of deps(t)) succ.set(d, [...(succ.get(d) || []), t]);
  const projectEnd = new Date(Math.max(...tasks.map((t) => t.endDate.getTime()), 0));
  const lateFinish = new Map<string, Date>(), lateStart = new Map<string, Date>();
  for (const t of [...order].reverse()) {
    const ss = succ.get(t.id) || [];
    const lf = ss.length ? prevWorkday(cal, new Date(Math.min(...ss.map((s) => (lateStart.get(s.id) || s.startDate).getTime())) - DAY)) : projectEnd;
    lateFinish.set(t.id, lf);
    const len = Math.max(0, workdaysBetween(cal, t.startDate, t.endDate));
    let ls = lf; for (let i = 0; i < len; i++) ls = prevWorkday(cal, new Date(ls.getTime() - DAY));
    lateStart.set(t.id, ls);
  }
  const info = new Map<string, { slack: number; critical: boolean }>();
  for (const t of tasks) { const slack = workdaysBetween(cal, t.endDate, lateFinish.get(t.id) || t.endDate); info.set(t.id, { slack, critical: tasks.length > 1 && slack <= 0 && t.status !== "DONE" }); }
  const issues: string[] = [];
  for (const t of tasks) { const h = holidayName(cal, t.startDate) || holidayName(cal, t.endDate); if (h && h !== "weekend") issues.push(`“${t.title}” touches a holiday (${h}) — press Reschedule.`); }
  const owned = tasks.filter((t) => t.ownerId && t.status !== "DONE");
  for (let i = 0; i < owned.length; i++) for (let j = i + 1; j < owned.length; j++) {
    const a = owned[i], b = owned[j];
    if (a.ownerId === b.ownerId && a.startDate <= b.endDate && b.startDate <= a.endDate) issues.push(`Same person on “${a.title}” and “${b.title}” at the same time.`);
  }
  return { info, issues: Array.from(new Set(issues)).slice(0, 20) };
}
