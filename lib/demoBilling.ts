import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { activeStudents, applyLocks, periodOf } from "./billing";

// OBEHUB billing for Dream University: three plans, Dream University on the Accreditation plan (per student, each term,
// 10% early-adopter discount), last term's invoice paid by bank transfer, and this term's invoice overdue but still in
// its grace period — so the VC sees the banner and nothing is locked.

export async function campusBilling() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await rdb.subscription.count({ where: { chairmanId: H } })) return ["Billing demo already there"]; } catch { throw new Error("Run prisma/migration_billing.sql first."); }
  const plan = async (name: string, modules: string[], pricing: string, price: number, period: string, note: string) => { const id = randomUUID(); await rdb.billingPlan.create({ data: { id, name, modulesJson: JSON.stringify(modules), pricing, price, period, note } }); return id; };
  await plan("Starter", [], "FLAT", 150000, "YEARLY", "Core OBE for one department");
  const acc = await plan("Accreditation", ["accreditation", "quality", "surveys", "complexProblems", "portfolio", "training"], "PER_STUDENT", 600, "TERM", "Everything for an NCEAC / NBEAC visit");
  await plan("Full university", ["accreditation", "quality", "surveys", "complexProblems", "labs", "quizzes", "paperVetting", "fyp", "timetable", "planning", "remediation", "portfolio", "studentServices", "messaging", "training", "admissions", "finance", "inventory"], "PER_STUDENT", 1100, "TERM", "Every module");
  await rdb.subscription.create({ data: { chairmanId: H, planId: acc, status: "ACTIVE", startDate: new Date("2025-07-01"), discountPct: 10, discountNote: "Early adopter", graceDays: 15, readOnlyDays: 15, billingEmail: "accounts@dream.example" } });
  const students = await activeStudents(H);
  const mk = async (when: Date, number: string, dueInDays: number, paid: boolean) => {
    const [start, end] = periodOf("TERM", when); const amount = 600 * students, discount = Math.round(amount * 10) / 100, total = amount - discount;
    const issued = new Date(Math.max(start.getTime(), Date.now() - (dueInDays < 0 ? 20 : 200) * 864e5));
    const id = randomUUID();
    await rdb.billingInvoice.create({ data: { id, chairmanId: H, number, planId: acc, periodStart: start, periodEnd: end, issuedAt: issued, dueAt: new Date(Date.now() + dueInDays * 864e5), students, amount, discount, total, status: paid ? "PAID" : "DUE", paidAt: paid ? new Date(Date.now() + (dueInDays - 3) * 864e5) : null, linesJson: JSON.stringify([{ text: `Accreditation — each term ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`, qty: students, rate: 600, amount }, { text: "Discount 10% (Early adopter)", qty: 1, rate: -discount, amount: -discount }]) } });
    if (paid) await rdb.billingPayment.create({ data: { id: randomUUID(), invoiceId: id, chairmanId: H, amount: total, method: "BANK_TRANSFER", reference: "HBL-FT-2026-0418-7731", paidOn: new Date(Date.now() + (dueInDays - 3) * 864e5) } });
    return total;
  };
  const last = new Date(); last.setUTCMonth(last.getUTCMonth() - 6);
  const t1 = await mk(last, `INV-${last.getUTCFullYear()}-0001`, -170, true);
  const t2 = await mk(new Date(), `INV-${new Date().getUTCFullYear()}-0002`, -5, false); // 5 days overdue, within the 15-day grace
  await applyLocks(H);
  return ["3 plans (Starter, Accreditation, Full university)", `Dream University on Accreditation (Rs 600 per student each term, 10% discount): last term Rs ${Math.round(t1).toLocaleString("en-PK")} paid`, `this term Rs ${Math.round(t2).toLocaleString("en-PK")} 5 days overdue — within the grace period, so the VC sees a banner and nothing is locked`];
}
