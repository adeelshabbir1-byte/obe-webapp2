import { randomUUID } from "crypto";
import { prisma } from "./db";

// In-app notifications: the bell in the top bar. Creating one never throws — a missing table or a failed email must
// never block the action that caused it. Important kinds also go by email when RESEND_API_KEY and EMAIL_FROM are set.

const ndb = prisma as unknown as Record<string, any>;
export type NotificationRow = { id: string; userId: string; kind: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date };
const EMAIL_KINDS = new Set(["ASSIGNMENT", "RESULT", "GRADE_CHANGE", "TEMPLATE", "DEADLINE"]);

export async function notifyUsers(userIds: (string | null | undefined)[], n: { kind: string; title: string; body?: string; href?: string; exceptId?: string | null }) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x && x !== n.exceptId)));
  if (!ids.length) return;
  try {
    await ndb.notification.createMany({ data: ids.map((userId) => ({ id: randomUUID(), userId, kind: n.kind, title: n.title.slice(0, 300), body: n.body?.slice(0, 2000) || null, href: n.href || null })) });
  } catch { return; }
  if (EMAIL_KINDS.has(n.kind)) await emailUsers(ids, n.title, n.body || "", n.href);
}

async function emailUsers(ids: string[], subject: string, body: string, href?: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return;
  try {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { email: true, name: true } });
    const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    await Promise.all(users.filter((u) => u.email).slice(0, 50).map((u) => fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [u.email], subject, text: `Dear ${u.name},\n\n${body}\n\n${base && href ? base + href : ""}` }),
    }).catch(() => null)));
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
