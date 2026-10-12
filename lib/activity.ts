import { prisma } from "./db";

// Remembers when each person last used the app (for the sign-in watch in lib/inactivity.ts). Kept tiny and free of
// other imports because lib/session.ts calls it on every signed-in request.
const adb = prisma as unknown as Record<string, any>;
const lastWrite = new Map<string, number>();

/** Writes at most once every 15 minutes per person (per server instance) and never blocks or throws. */
export function touchActivity(userId: string) {
  const now = Date.now();
  if (now - (lastWrite.get(userId) || 0) < 15 * 60000) return;
  lastWrite.set(userId, now);
  try { adb.userActivity?.upsert({ where: { userId }, update: { lastSeenAt: new Date(now) }, create: { userId, lastSeenAt: new Date(now) } }).catch(() => null); } catch { /* table missing */ }
}
