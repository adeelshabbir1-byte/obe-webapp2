import { randomUUID } from "crypto";
import { prisma } from "./db";

// Leave types on top of Short Leave: each type has days a year, how many unused days carry into next year, an upper
// limit per request and whether the Dean must approve after the HOD. Classes in the leave must be covered
// (substitute, make-up or cancelled) before it is approved.

const ldb = prisma as unknown as Record<string, any>;
export type Policy = { kind: string; label: string; perYear: number; carryMax: number; needsDean: boolean; maxDays: number | null };
export const DEFAULT_POLICIES: Policy[] = [
  { kind: "CASUAL", label: "Casual leave", perYear: 10, carryMax: 0, needsDean: false, maxDays: 3 },
  { kind: "SICK", label: "Sick / medical leave", perYear: 12, carryMax: 0, needsDean: false, maxDays: 30 },
  { kind: "EARNED", label: "Earned leave", perYear: 30, carryMax: 60, needsDean: true, maxDays: 60 },
  { kind: "MATERNITY", label: "Maternity leave", perYear: 90, carryMax: 0, needsDean: true, maxDays: 90 },
  { kind: "PATERNITY", label: "Paternity leave", perYear: 7, carryMax: 0, needsDean: false, maxDays: 7 },
  { kind: "STUDY", label: "Study leave", perYear: 365, carryMax: 0, needsDean: true, maxDays: 365 },
  { kind: "HAJJ", label: "Hajj / Umrah leave", perYear: 40, carryMax: 0, needsDean: true, maxDays: 40 },
  { kind: "DUTY", label: "Duty leave (official work, conference, exam duty)", perYear: 0, carryMax: 0, needsDean: false, maxDays: 30 },
  { kind: "WITHOUT_PAY", label: "Leave without pay", perYear: 0, carryMax: 0, needsDean: true, maxDays: 180 },
];
export const UNLIMITED = new Set(["DUTY", "WITHOUT_PAY"]);
export type Detail = { leaveId: string; kind: string; days: number; deanStatus: string; hodId: string | null; hodAt: Date | null; deanId: string | null; deanAt: Date | null; deanNote: string | null };

export async function policies(chairmanId: string): Promise<Policy[]> {
  let rows: { kind: string; perYear: number; carryMax: number; needsDean: boolean; maxDays: number | null }[] = [];
  try { rows = await ldb.leavePolicy.findMany({ where: { chairmanId } }); } catch { rows = []; }
  return DEFAULT_POLICIES.map((p) => { const r = rows.find((x) => x.kind === p.kind); return r ? { ...p, perYear: r.perYear, carryMax: r.carryMax, needsDean: r.needsDean, maxDays: r.maxDays } : p; });
}
export async function savePolicy(chairmanId: string, p: Omit<Policy, "label">) {
  await ldb.leavePolicy.upsert({ where: { chairmanId_kind: { chairmanId, kind: p.kind } }, create: { id: randomUUID(), chairmanId, ...p, updatedAt: new Date() }, update: { perYear: p.perYear, carryMax: p.carryMax, needsDean: p.needsDean, maxDays: p.maxDays, updatedAt: new Date() } });
}

/** Working days in a range (Sundays not counted). */
export function workingDays(from: Date, to: Date) {
  let n = 0;
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() !== 0) n++;
  return n;
}

export async function details(leaveIds: string[]): Promise<Map<string, Detail>> {
  try { return new Map(((await ldb.leaveDetail.findMany({ where: { leaveId: { in: leaveIds.concat("none") } } })) as Detail[]).map((d) => [d.leaveId, d])); } catch { return new Map(); }
}

/** Per type: allowance this year (+ carried from last year), used (approved), pending, left. */
export async function balances(userId: string, chairmanId: string, year = new Date().getUTCFullYear()) {
  const pol = await policies(chairmanId);
  const leaves = (await ldb.shortLeave.findMany({ where: { userId, status: { in: ["APPROVED", "PENDING"] }, fromDate: { gte: new Date(Date.UTC(year - 1, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }, select: { id: true, status: true, fromDate: true, toDate: true } }).catch(() => [])) as { id: string; status: string; fromDate: Date; toDate: Date }[];
  const det = await details(leaves.map((l) => l.id));
  const sum = (kind: string, y: number, status: string) => leaves.filter((l) => l.status === status && new Date(l.fromDate).getUTCFullYear() === y && (det.get(l.id)?.kind || "CASUAL") === kind).reduce((a, l) => a + (det.get(l.id)?.days ?? workingDays(new Date(l.fromDate), new Date(l.toDate))), 0);
  return pol.map((p) => {
    const carried = p.carryMax ? Math.min(p.carryMax, Math.max(0, p.perYear - sum(p.kind, year - 1, "APPROVED"))) : 0;
    const used = sum(p.kind, year, "APPROVED"), pending = sum(p.kind, year, "PENDING");
    return { ...p, carried, allowance: p.perYear + carried, used, pending, left: UNLIMITED.has(p.kind) ? null : p.perYear + carried - used - pending };
  });
}

/** Check a new request against its type. Returns an error message, or null. */
export async function checkRequest(userId: string, chairmanId: string, kind: string, days: number) {
  const b = (await balances(userId, chairmanId)).find((x) => x.kind === kind);
  if (!b) return "Choose the type of leave.";
  if (b.maxDays && days > b.maxDays) return `${b.label} can be at most ${b.maxDays} working day(s) at a time.`;
  if (b.left !== null && days > b.left) return `Only ${Math.max(0, b.left)} day(s) of ${b.label.toLowerCase()} left this year (asked for ${days}). Take the rest as leave without pay.`;
  return null;
}

export async function saveDetail(leaveId: string, kind: string, days: number) {
  await ldb.leaveDetail.create({ data: { id: randomUUID(), leaveId, kind, days, deanStatus: "NONE" } });
}
export async function setDetail(leaveId: string, data: Partial<Detail>) {
  await ldb.leaveDetail.updateMany({ where: { leaveId }, data });
}
