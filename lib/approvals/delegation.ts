import { prisma } from "../db";

// Delegation of approvals: someone on leave hands their approvals to a colleague for a date range. The approver
// resolver (lib/approvers.ts) adds the delegate wherever the person is an approver, so the modules accept the
// delegate's decision; the inbox shows the delegated items "on behalf of" the person; every decision is recorded with both.

const ddb = prisma as unknown as Record<string, any>;
export type Delegation = { id: string; chairmanId: string; fromUserId: string; toUserId: string; startDate: Date; endDate: Date; note: string | null; revokedAt: Date | null };
const live = (now = new Date()) => ({ revokedAt: null, startDate: { lte: now }, endDate: { gte: now } });

/** Delegates currently acting for these people: personId → delegate ids. */
export async function delegatesOf(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  try {
    const rows = (await ddb.approvalDelegation.findMany({ where: { fromUserId: { in: ids }, ...live() }, select: { fromUserId: true, toUserId: true } })) as { fromUserId: string; toUserId: string }[];
    for (const r of rows) out.set(r.fromUserId, [...(out.get(r.fromUserId) || []), r.toUserId]);
  } catch { /* migration_approvals_inbox.sql not run yet */ }
  return out;
}
/** People who have delegated their approvals to this person now. */
export async function delegatorsTo(userId: string): Promise<Delegation[]> {
  try { return (await ddb.approvalDelegation.findMany({ where: { toUserId: userId, ...live() } })) as Delegation[]; } catch { return []; }
}
export async function delegationsOf(chairmanId: string, userId?: string) {
  try { return (await ddb.approvalDelegation.findMany({ where: { chairmanId, ...(userId ? { OR: [{ fromUserId: userId }, { toUserId: userId }] } : {}), revokedAt: null, endDate: { gte: new Date() } }, orderBy: { startDate: "asc" } })) as Delegation[]; } catch { return null; }
}
