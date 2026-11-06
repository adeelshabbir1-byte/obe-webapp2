import { randomUUID } from "crypto";
import { prisma } from "./db";

// In-app notifications: the bell in the top bar. Creating one never throws — a missing table or a failed email must
// never block the action that caused it. Important kinds also go by email when RESEND_API_KEY and EMAIL_FROM are set.

const ndb = prisma as unknown as Record<string, any>;
export type NotificationRow = { id: string; userId: string; kind: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date };
const EMAIL_KINDS = new Set(["ASSIGNMENT", "RESULT", "GRADE_CHANGE", "TEMPLATE", "DEADLINE", "INACTIVITY", "APPROVALS_DIGEST", "APPROVAL_ESCALATION"]);

export async function notifyUsers(userIds: (string | null | undefined)[], n: { kind: string; title: string; body?: string; href?: string; exceptId?: string | null }) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x && x !== n.exceptId)));
  if (!ids.length) return;
  // The institute's own position titles (VC, Director of School …) in place of the default names.
  try {
    const first = await prisma.user.findUnique({ where: { id: ids[0] }, select: { id: true, role: true, managedById: true } });
    if (first && first.role !== "SUPER_USER") {
      const { instituteOfUser } = await import("./moduleLocks");
      const { titlesFor, applyTitles } = await import("./titles");
      const t = await titlesFor(await instituteOfUser({ id: first.id, role: first.role, managedById: first.managedById }));
      n = { ...n, title: applyTitles(n.title, t), body: n.body ? applyTitles(n.body, t) : n.body };
    }
  } catch { /* defaults */ }
  try {
    await ndb.notification.createMany({ data: ids.map((userId) => ({ id: randomUUID(), userId, kind: n.kind, title: n.title.slice(0, 300), body: n.body?.slice(0, 2000) || null, href: n.href || null })) });
  } catch { return; }
  // Email, SMS / WhatsApp and phone push go out from the background queue, after the response (lib/jobs.ts): the action
  // that caused the notification no longer waits for them.
  const { enqueue } = await import("./jobs");
  await enqueue("notify.deliver", { ids, n });
}

/** The background part of a notification: email for important kinds, SMS / WhatsApp, phone / browser push. */
export async function deliverNotification(p: { ids: string[]; n: { kind: string; title: string; body?: string; href?: string } }) {
  const { ids, n } = p;
  if (EMAIL_KINDS.has(n.kind)) await emailUsers(ids, n.title, n.body || "", n.href);
  // SMS / WhatsApp, when the institute has a gateway and this kind of alert turned on.
  try { const m = await import("./messaging"); await m.alertStaff(ids, n.kind, n.title, n.body); } catch { /* best effort */ }
  // Phone / browser push, when VAPID keys are set and the person allowed it (Adeel prompt §4).
  try { const w = await import("./webPush"); await w.pushTo({ userIds: ids }, n); } catch { /* best effort */ }
}

async function emailUsers(ids: string[], subject: string, body: string, href?: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { email: true, name: true } });
    const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    await Promise.all(users.filter((u) => u.email).slice(0, 50).map((u) => fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [u.email], subject, text: `Dear ${u.name},\n\n${body}\n\n${base && href ? base + href : ""}` }), signal: AbortSignal.timeout(15000) }).catch(() => null)));
  } catch { /* email is best effort */ }
}

export async function unreadCount(userId: string): Promise<number> {
  try { return (await ndb.notification.count({ where: { userId, readAt: null } })) as number; } catch { return 0; }
}
export async function latest(userId: string, take = 30): Promise<NotificationRow[]> {
  try { return (await ndb.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take })) as NotificationRow[]; } catch { return []; }
}
export async function markRead(userId: string, id?: string) {
  try { await ndb.notification.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } }); } catch { /* ignore */ }
}
/** People holding a role in an institute (main role or an extra hat), e.g. every OMC member. */
export async function holdersOf(chairmanId: string, role: string): Promise<string[]> {
  const where = role === "OMC"
    ? { OR: [{ role: "OMC" }, { omcHat: true }], managedById: chairmanId, isActive: true }
    : { OR: [{ role }, { secondaryRole: role }, { tertiaryRole: role }, { extraRoles: { has: role } }], managedById: chairmanId, isActive: true };
  try { return (await prisma.user.findMany({ where: where as never, select: { id: true } })).map((u) => u.id); } catch { return []; }
}
