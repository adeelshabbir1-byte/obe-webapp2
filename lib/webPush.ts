import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getFlag } from "./scopedSettings";

// Web push (Adeel prompt §4). Needs VAPID keys as Vercel env variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and
// VAPID_SUBJECT, e.g. mailto:it@university.edu.pk). Without them nothing is sent. Each person picks the kinds they want
// (UserFlag "push:kinds", a JSON list; empty = all). Subscriptions that the browser rejects (404 / 410) are removed.
const db = prisma as unknown as Record<string, any>;
export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const PUSH_KINDS: [string, string][] = [["QUIZ", "Quizzes"], ["RESULT_STUDENT", "Marks and results published"], ["DEADLINE", "Deadlines"], ["APPROVAL", "Approvals"], ["WARNING", "Early warnings"], ["TIMETABLE", "Timetable changes"], ["DIGEST", "Digest"], ["OTHER", "Everything else"]];
const kindGroup = (k: string) => (PUSH_KINDS.some(([x]) => x === k) ? k : /APPROV/.test(k) ? "APPROVAL" : /WARN|REMED|CQI/.test(k) ? "WARNING" : /RESULT|MARK/.test(k) ? "RESULT_STUDENT" : "OTHER");

export async function subscribe(who: { userId?: string; studentId?: string }, s: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!db.pushSubscription) throw new Error("Run prisma/migration_adeel_p7.sql in Supabase first.");
  await db.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: { id: randomUUID(), userId: who.userId || null, studentId: who.studentId || null, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, update: { userId: who.userId || null, studentId: who.studentId || null, p256dh: s.keys.p256dh, auth: s.keys.auth } });
}

/** Send a push to people (staff ids and/or student ids). Fire-and-forget; never throws. */
export async function pushTo(target: { userIds?: string[]; studentIds?: string[] }, n: { kind: string; title: string; body?: string; href?: string }) {
  try {
    if (!pushReady() || !db.pushSubscription) return 0;
    const subs = (await db.pushSubscription.findMany({ where: { OR: [{ userId: { in: (target.userIds || []).concat("none") } }, { studentId: { in: (target.studentIds || []).concat("none") } }] }, take: 500 })) as { id: string; userId: string | null; endpoint: string; p256dh: string; auth: string }[];
    if (!subs.length) return 0;
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@obehub.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const group = kindGroup(n.kind);
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      if (s.userId) { const pref = await getFlag(s.userId, "push:kinds").catch(() => null); if (pref) { try { const k = JSON.parse(pref) as string[]; if (k.length && !k.includes(group)) return; } catch { /* all */ } } }
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body || "", url: n.href || "/" }), { TTL: 3600 }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null); }
    }));
    return sent;
  } catch { return 0; }
}
