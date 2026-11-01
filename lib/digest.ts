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
    if (!hot.length) continue;
    const red = hot.filter((x) => x.s === "red").length;
    await notifyUsers([u.id], { kind: "DIGEST", title: `${red ? `${red} overdue · ` : ""}${hot.length - red} due soon`, body: hot.slice(0, 8).map((x) => `${x.s === "red" ? "🔴" : "🟠"} ${x.t.title}`).join("\n"), href: "/dashboard#whats-next" }).catch(() => null);
    sent++;
  }
  return sent;
}
