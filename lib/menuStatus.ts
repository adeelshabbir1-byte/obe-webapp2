import { nextTasks, type NextUser } from "./nextTasks";
import type { Task } from "./nextTasksCore";
import { chainFor, flagsLike, numberSetting } from "./scopedSettings";
import { menuStatuses, taskKey, type LinkStatus } from "./menuStatusCore";

// Menu colours, badges and reasons for one person (Adeel prompt §1), from the "What's next" tasks. Worked out at most once
// every 3 minutes per person (cached), never on every page. The amber window N comes from the "menu.amberDays" setting
// (OMC per department, Program Lead per program; lib/settingsRegistry.ts). Items marked "waiting on someone else" are left out
// until their recheck date.

export const AMBER_KEY = "menu.amberDays";
const cache = new Map<string, { at: number; tasks: Task[]; amber: number; waiting: Set<string> & { expired: Set<string> } }>();
const TTL = 180_000;

export type Waiting = { reason: string; onUserId?: string | null; until: string };
export async function waitingFor(userId: string, now = new Date()) {
  const rows = await flagsLike(userId, "wait:");
  const keys = new Set<string>(), expired = new Set<string>();
  for (const r of rows) { try { const w = JSON.parse(r.value) as Waiting; (new Date(w.until) > now ? keys : expired).add(r.key.slice(5)); } catch { /* skip */ } }
  return Object.assign(keys, { expired });
}

async function load(user: NextUser) {
  const c = cache.get(user.id);
  if (c && Date.now() - c.at < TTL) return c;
  const [tasks, amber, waiting] = await Promise.all([
    nextTasks(user).then((r) => r.tasks).catch(() => [] as Task[]),
    chainFor({ id: user.id, role: user.role, managedById: user.managedById, departmentId: user.departmentId }).then((ch) => numberSetting(ch, AMBER_KEY, 3)).catch(() => 3),
    waitingFor(user.id).catch(() => Object.assign(new Set<string>(), { expired: new Set<string>() })),
  ]);
  const v = { at: Date.now(), tasks, amber, waiting };
  cache.set(user.id, v);
  return v;
}
export function forgetMenuState(userId: string) { cache.delete(userId); }

/** Open-task count (for the top bar) and the status of each menu link. */
export async function menuState(user: NextUser, linkHrefs: string[]): Promise<{ count: number; statuses: Record<string, LinkStatus> }> {
  const s = await load(user);
  // Still waiting after the recheck date: red again for the person who was waiting.
  const open = s.tasks.filter((t) => !s.waiting.has(taskKey(t))).map((t) => (s.waiting.expired.has(taskKey(t)) ? { ...t, due: null, urgency: "overdue" as const } : t));
  return { count: open.length, statuses: menuStatuses(open, linkHrefs, s.amber, new Set()) };
}
