import { rdb, type Who } from "./registers";

// Employee benefits register: the institute's plans, who is enrolled and their claims. HR / Finance (the Finance Officer
// and the institute head) manage it; every member of staff sees their own benefits. The summary is what NBEAC's
// Form 7 (employee benefits) asks for.

export const BEN_HINT = "The benefits register needs prisma/migration_benefits.sql — run it in Supabase.";
export const KINDS: Record<string, string> = { HEALTH: "Health insurance", PROVIDENT_FUND: "Provident fund", PENSION: "Pension / gratuity", LEAVE_ENCASHMENT: "Leave encashment", FEE_CONCESSION: "Children's fee concession", TRANSPORT: "Transport allowance", HOUSING: "Housing / house rent", OTHER: "Other" };
export const CLAIM: Record<string, string> = { SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Not approved", PAID: "Paid" };
export type Plan = { id: string; chairmanId: string; kind: string; name: string; provider: string | null; policyNo: string | null; coverage: string | null; limitAmount: number | null; dependants: string | null; premium: number | null; employerSharePct: number | null; employeeSharePct: number | null; eligibility: string | null; renewalDate: Date | null; active: boolean; lastRenewalNotice: string | null };
export const canManageBenefits = (w: Who) => w.head || w.finance;

/** Daily: plans renewing within 30 days → tell the Finance Officer and the institute head (once a week per plan). */
export async function remindRenewals(now = new Date()) {
  const { notifyUsers } = await import("./notifications");
  const soon = new Date(now.getTime() + 30 * 864e5);
  const plans = (await rdb.benefitPlan.findMany({ where: { active: true, renewalDate: { gte: now, lte: soon } } }).catch(() => [])) as Plan[];
  const week = `${now.getFullYear()}-${Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 864e5))}`;
  let sent = 0;
  for (const p of plans) {
    if (p.lastRenewalNotice === week) continue;
    const fin = await rdb.user.findMany({ where: { role: "FINANCE_OFFICER", isActive: true, OR: [{ managedById: p.chairmanId }, { managedBy: { managedById: p.chairmanId } }] }, select: { id: true } });
    await notifyUsers([...fin.map((f: { id: string }) => f.id), p.chairmanId], { kind: "BENEFITS", title: `${p.name} renews on ${new Date(p.renewalDate!).toLocaleDateString("en-GB")}`, href: "/benefits" });
    await rdb.benefitPlan.update({ where: { id: p.id }, data: { lastRenewalNotice: week } });
    sent++;
  }
  return sent;
}
