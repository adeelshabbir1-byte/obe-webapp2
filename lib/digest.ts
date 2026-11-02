import { prisma } from "./db";
import { nextTasks } from "./nextTasks";
import { notifyUsers } from "./notifications";
import { chainFor, numberSetting } from "./scopedSettings";
import { statusOf } from "./menuStatusCore";
import { AMBER_KEY, waitingFor } from "./menuStatus";
import { taskKey } from "./menuStatusCore";

// The red-and-amber digest (Adeel prompt §1): people who chose "daily" get it every day, "weekly" on Mondays. Nothing is
// sent when nothing is red or amber. Delivered as a notification (which follows the person's own email choice).
const db = prisma as unknown as Record<string, any>;
export async function runDigest(now = new Date()) {
  const rows = ((await db.userFlag?.findMany({ where: { key: "digest", value: { in: now.getUTCDay() === 1 ? ["daily", "weekly"] : ["daily"] } }, take: 2000 }).catch(() => [])) || []) as { userId: string }[];
  let sent = 0;
  for (const r of rows) {
    const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { id: true, role: true, managedById: true, departmentId: true, isActive: true, name: true } }).catch(() => null);
    if (!u || !u.isActive) continue;
    const [tasks, amber, waiting] = await Promise.all([
      nextTasks(u as never, now).then((x) => x.tasks).catch(() => []),
      chainFor(u).then((c) => numberSetting(c, AMBER_KEY, 3)).catch(() => 3),
      waitingFor(u.id, now).catch(() => new Set<string>()),
    ]);
    const hot = tasks.filter((t) => !waiting.has(taskKey(t))).map((t) => ({ t, s: statusOf(t, amber, now) })).filter((x) => x.s !== "blue");
    const weak = await weakGaLines(u.id, u.role).catch(() => [] as { line: string; courseId: string }[]);
    if (!hot.length && !weak.length) continue;
    const red = hot.filter((x) => x.s === "red").length;
    const action = weak.length ? `\nSuggested this week: hold a short tutorial on ${weak[0].line.split(" ")[0]}, record it on "Generate from the plan", then rebalance your next paper toward it.` : "";
    await notifyUsers([u.id], { kind: "DIGEST", title: hot.length ? `${red ? `${red} overdue · ` : ""}${hot.length - red} due soon${weak.length ? ` · ${weak.length} weak GA` : ""}` : `${weak.length} weak graduate attribute${weak.length > 1 ? "s" : ""} in your courses`, body: [...hot.slice(0, 8).map((x) => `${x.s === "red" ? "🔴" : "🟠"} ${x.t.title}`), ...weak.map((w) => `📉 ${w.line}`)].join("\n") + action, href: weak.length && !hot.length ? `/plan-generate?courseId=${weak[0].courseId}` : "/dashboard#whats-next" }).catch(() => null);
    sent++;
  }
  return sent;
}

/** A teacher's weak graduate attributes this term (from his own courses' CLO results), for the digest. */
async function weakGaLines(userId: string, role: string) {
  if (!["INSTRUCTOR", "SUBJECT_EXPERT"].includes(role)) return [];
  const cs = await prisma.course.findMany({ where: { isOffered: true, instructorId: userId }, take: 3, select: { id: true, code: true } });
  const { gaOfCourse } = await import("./planGen");
  const out: { line: string; courseId: string }[] = [];
  for (const c of cs) for (const g of (await gaOfCourse(c.id).catch(() => ({ weak: [] as { ga: string; pct: number }[] }))).weak.slice(0, 2)) out.push({ line: `${g.ga} weak in ${c.code} (${g.pct}%)`, courseId: c.id });
  return out.slice(0, 4);
}
