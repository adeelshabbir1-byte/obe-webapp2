import { randomUUID } from "crypto";
import { prisma } from "./db";
import { rdb, parseJ, type Who } from "./registers";

// Fee refunds by the institute's schedule — by default HEC's fee refund policy: the full tuition fee back up to the 7th
// day of classes, half from the 8th to the 15th day, nothing from the 16th day. The admission fee is never refunded;
// a security deposit always is. A refund case opens on its own when a student's leaving (Status Changes) is applied;
// the Finance Officer approves it and records the payment.

export const REFUND_HINT = "Fee refunds need prisma/migration_fee_refunds.sql — run it in Supabase.";
export type Step = { uptoDay: number; pct: number };
export const HEC_SCHEDULE: Step[] = [{ uptoDay: 7, pct: 100 }, { uptoDay: 15, pct: 50 }];
export const STATUS: Record<string, string> = { PENDING: "Waiting for the Finance Officer", APPROVED: "Approved — to be paid", REJECTED: "Not refunded", PAID: "Paid" };
export const canDecideRefunds = (w: Who) => w.finance || w.head;
const NON_REFUNDABLE = /admission|registration|enrol?ment|prospectus|form/i, SECURITY = /security|deposit|caution/i;

export async function scheduleFor(chairmanId: string): Promise<Step[]> {
  const r = await rdb.feeRefundRule.findUnique({ where: { chairmanId } }).catch(() => null);
  const s = parseJ<Step[]>(r?.rulesJson, HEC_SCHEDULE).filter((x) => x.uptoDay > 0 && x.pct >= 0 && x.pct <= 100).sort((a, b) => a.uptoDay - b.uptoDay);
  return s.length ? s : HEC_SCHEDULE;
}
/** The refund % on a given day of classes (day 1 = the first day). */
export const pctOn = (s: Step[], dayNo: number) => (dayNo <= 0 ? 100 : s.find((x) => dayNo <= x.uptoDay)?.pct ?? 0);

/** Split what was paid on an invoice into tuition (refundable by the schedule), non-refundable fees and a security deposit. */
export function splitInvoice(inv: { linesJson: string; paid: number }) {
  const lines = parseJ<{ label?: string; name?: string; head?: string; amount?: number }[]>(inv.linesJson, []);
  const tag = (l: (typeof lines)[number]) => `${l.label || l.name || l.head || ""}`;
  const non = lines.filter((l) => NON_REFUNDABLE.test(tag(l))).reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const sec = lines.filter((l) => SECURITY.test(tag(l))).reduce((t, l) => t + (Number(l.amount) || 0), 0);
  // Payments are taken against non-refundable fees first, then the deposit, then tuition.
  let left = inv.paid;
  const nonPaid = Math.min(left, non); left -= nonPaid;
  const secPaid = Math.min(left, sec); left -= secPaid;
  return { nonRefundable: nonPaid, securityDeposit: secPaid, tuitionPaid: Math.max(0, left) };
}

/** Called when a student's leaving is applied: open the refund case (unless one is open already). Returns a line for the effects list. */
export async function openRefundCase(req: { id: string; chairmanId: string; studentId: string; type: string; effectiveDate: Date }, actorId: string): Promise<string | null> {
  if (!["DROPPED", "LEFT", "TRANSFER_OUT"].includes(req.type)) return null;
  if (await rdb.feeRefundCase.findFirst({ where: { studentId: req.studentId, statusRequestId: req.id } })) return null;
  const st = await prisma.student.findUnique({ where: { id: req.studentId }, select: { name: true, rollNumber: true, batch: { select: { degreeProgram: true, coordinatorId: true } } } });
  const inv = (await prisma.feeInvoice.findFirst({ where: { studentId: req.studentId }, orderBy: [{ termYear: "desc" }, { createdAt: "desc" }] })) as { id: string; termName: string; termYear: number; linesJson: string; paid: number } | null;
  // The term: the invoice's, or (without one) the term the leaving date falls in.
  const eff = new Date(req.effectiveDate);
  const term = inv ? { termName: inv.termName, termYear: inv.termYear } : { termName: eff.getMonth() >= 7 ? "Fall" : eff.getMonth() <= 4 ? "Spring" : "Summer", termYear: eff.getFullYear() };
  const sd = st ? await prisma.semesterDates.findFirst({ where: { coordinatorId: st.batch.coordinatorId, ...term, degreeProgram: st.batch.degreeProgram }, select: { semesterStartDate: true } }).catch(() => null) : null;
  const start = sd?.semesterStartDate || null;
  const dayNo = start ? Math.floor((new Date(req.effectiveDate).getTime() - new Date(start).getTime()) / 864e5) + 1 : null;
  const schedule = await scheduleFor(req.chairmanId);
  const pct = dayNo === null ? 0 : pctOn(schedule, dayNo);
  const split = inv ? splitInvoice(inv) : { nonRefundable: 0, securityDeposit: 0, tuitionPaid: 0 };
  const amount = Math.round(split.tuitionPaid * pct / 100 + split.securityDeposit);
  await rdb.feeRefundCase.create({ data: { id: randomUUID(), chairmanId: req.chairmanId, studentId: req.studentId, statusRequestId: req.id, reason: req.type, withdrawalDate: req.effectiveDate, classesStart: start, dayNo, invoiceId: inv?.id || null, ...split, refundPct: pct, refundAmount: amount, note: dayNo === null ? "The term's first day of classes is not set (Semester Dates): check the day by hand." : null } });
  const fin = await prisma.user.findMany({ where: { role: "FINANCE_OFFICER", isActive: true, OR: [{ managedById: req.chairmanId }, { managedBy: { managedById: req.chairmanId } }] }, select: { id: true } });
  const { notifyUsers } = await import("./notifications");
  await notifyUsers([...fin.map((f) => f.id), req.chairmanId], { kind: "FEE_REFUND", title: `Fee refund to decide: ${st?.name} (${st?.rollNumber}) — Rs ${amount.toLocaleString("en-PK")}`, href: "/fee-refunds", exceptId: actorId });
  return `Fee refund case opened: ${pct}% of tuition${split.securityDeposit ? " plus the security deposit" : ""} = Rs ${amount.toLocaleString("en-PK")} (waiting for the Finance Officer).`;
}
