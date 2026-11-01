// "What's next for me": the shape of a task, the order they are shown in, and running the sources so that one failing
// source never breaks the home page. No database here (tested on its own).

export type Urgency = "overdue" | "soon" | "normal";
export type Task = { title: string; detail?: string | null; href: string; due?: Date | null; urgency: Urgency; source: string };
export type Source<U> = { name: string; run: (user: U, now: Date) => Promise<Task[]> };

const DAY = 864e5;
/** Overdue when the due date has passed, soon within 3 days, else normal (unless the source says otherwise). */
export function urgencyOf(due: Date | null | undefined, now = new Date(), fallback: Urgency = "normal"): Urgency {
  if (!due) return fallback;
  const t = new Date(due).getTime() - now.getTime();
  return t < 0 ? "overdue" : t <= 3 * DAY ? "soon" : fallback;
}
const RANK: Record<Urgency, number> = { overdue: 0, soon: 1, normal: 2 };
/** Overdue first, then due soon, then the rest; within each, the earliest due date first, undated last. */
export function sortTasks(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity) || a.title.localeCompare(b.title));
}
/** Runs every source; a source that throws is skipped (and named), the others still count. Same task twice: once. */
export async function runSources<U>(sources: Source<U>[], user: U, now = new Date()) {
  const failed: string[] = [];
  const lists = await Promise.all(sources.map(async (s) => { try { return (await s.run(user, now)).map((t) => ({ ...t, source: t.source || s.name })); } catch { failed.push(s.name); return [] as Task[]; } }));
  const seen = new Set<string>();
  const tasks = sortTasks(lists.flat()).filter((t) => { const k = `${t.title}|${t.href}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { tasks, failed };
}
/** "due Fri" / "due 12 Nov" / "2 days overdue". */
export function dueText(due: Date | null | undefined, now = new Date()) {
  if (!due) return "";
  const d = new Date(due), days = Math.floor((d.getTime() - now.getTime()) / DAY);
  if (days < 0) return `${-days} day${-days === 1 ? "" : "s"} overdue`;
  if (days < 6) return `due ${d.toLocaleDateString("en-GB", { weekday: "short" })}`;
  return `due ${d.getUTCDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
}
