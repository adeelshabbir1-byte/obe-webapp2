import { prisma } from "./db";
import { staffOf } from "./registers";
import { saveSetting } from "./scopedSettings";
import { summarise, cleanMinutes, type Minutes } from "./pilotFiguresCore";

const db = prisma as unknown as Record<string, any>;
const KEY = "pilot.minutes";
export const PERIODS = [30, 90, 180, 365];

export async function minutesOf(chairmanId: string): Promise<Minutes> {
  const r = await db.scopedSetting?.findFirst({ where: { chairmanId, scopeType: "INSTITUTE", scopeId: chairmanId, key: KEY } }).catch(() => null);
  try { return cleanMinutes(JSON.parse(r?.value || "{}")); } catch { return {}; }
}
export async function saveMinutes(chairmanId: string, raw: unknown, byId: string) {
  const m = cleanMinutes(raw);
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, KEY, JSON.stringify(m), byId);
  return m;
}

/** Work recorded by this institute's staff in the last `days` days, grouped into areas, with hours saved where entered. */
export async function pilotFigures(chairmanId: string, days: number) {
  const since = new Date(Date.now() - days * 86400000);
  const staff = await staffOf(chairmanId);
  const ids = staff.map((s) => s.id);
  const groups = ids.length ? ((await prisma.auditLog.groupBy({ by: ["action"], where: { actorUserId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }).catch(() => [])) as { action: string; _count: { _all: number } }[]) : [];
  const counts = Object.fromEntries(groups.map((g) => [g.action, g._count._all]));
  const people = ids.length ? (await prisma.auditLog.findMany({ where: { actorUserId: { in: ids }, createdAt: { gte: since } }, distinct: ["actorUserId"], select: { actorUserId: true } }).catch(() => [])).length : 0;
  const minutes = await minutesOf(chairmanId);
  return { ...summarise(counts, minutes), minutes, people, staff: ids.length, since, days };
}
