import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

export const ebdb = prisma as unknown as Record<string, any>;

/** The institute whose exams this person may run (Institute Head, or someone the Institute Head put in the exam branch), else null. */
export async function examChairman(user: { id: string; role: string; managedById: string | null }): Promise<string | null> {
  if (user.role === "CHAIRMAN") return user.id;
  const cid = await chairmanIdFor(user).catch(() => "");
  if (!cid) return null;
  // The Controller of Examinations runs the exam branch.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true } }).catch(() => null);
  if (me?.extraRoles?.includes("EXAM_CONTROLLER")) return cid;
  const n = (await ebdb.examStaff.count({ where: { chairmanId: cid, userId: user.id } }).catch(() => 0)) as number;
  return n ? cid : null;
}

export async function isExamBranch(user: { id: string; role: string; managedById: string | null }) {
  return !!(await examChairman(user));
}

/** The duty pool for a session: if Program Leads have listed people, only them; otherwise everyone who teaches. */
export async function dutyPool(sessionId: string, everyone: string[]) {
  const rows = (await ebdb.examDutyPool.findMany({ where: { sessionId }, select: { userId: true } }).catch(() => [])) as { userId: string }[];
  return rows.length ? everyone.filter((id) => rows.some((r) => r.userId === id)).concat(rows.map((r) => r.userId).filter((id) => !everyone.includes(id))) : everyone;
}

export async function prefsOf(sessionId: string) {
  const rows = (await ebdb.examDutyPref.findMany({ where: { sessionId } }).catch(() => [])) as { userId: string; slotsJson: string; maxPerDay: number }[];
  return new Map(rows.map((r) => { let s: string[] = []; try { s = JSON.parse(r.slotsJson); } catch { s = []; } return [r.userId, { slots: new Set(s), maxPerDay: Math.max(0, r.maxPerDay) }] as const; }));
}

/** Direct swaps with a colleague are allowed on the day duties were published (Pakistan time); after that, through the exam branch. */
export async function swapMode(sessionId: string): Promise<"PEER" | "BRANCH"> {
  const p = (await ebdb.examPublishLog.findUnique({ where: { sessionId } }).catch(() => null)) as { publishedAt: Date } | null;
  if (!p) return "BRANCH";
  const day = (d: Date) => new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  return day(p.publishedAt) === day(new Date()) ? "PEER" : "BRANCH";
}
