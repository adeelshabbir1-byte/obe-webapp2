import { randomUUID } from "crypto";
import { prisma } from "./db";
import { balanceOf, statusOf } from "./fees";
import { edb, post } from "./erp";
import { notifyUsers } from "./notifications";

// Fee clearance and online payment. Finance sets the bank details printed on challans and what an unpaid fee holds back
// (admit card, self-registration, degree). Students who paid by bank, JazzCash, Easypaisa or 1Bill enter the transaction
// id; Finance verifies it and the payment is posted to the invoice and the accounts.

const fdb = prisma as unknown as Record<string, any>;
export const FEE_HINT = "Needs prisma/migration_batch5.sql — run it in Supabase.";
export type Bank = { bank?: string; title?: string; account?: string; iban?: string; branch?: string; jazzcash?: string; easypaisa?: string; onebill?: string };
export type FinSetting = { bank: Bank; blockAdmitCard: boolean; blockRegistration: boolean; blockDegree: boolean; minDue: number };
export const METHODS: [string, string][] = [["BANK", "Bank deposit / transfer"], ["JAZZCASH", "JazzCash"], ["EASYPAISA", "Easypaisa"], ["1BILL", "1Bill (any bank app)"]];

export async function financeSetting(cid: string | null | undefined): Promise<FinSetting> {
  const d: FinSetting = { bank: {}, blockAdmitCard: false, blockRegistration: false, blockDegree: true, minDue: 0 };
  if (!cid) return d;
  const r = await fdb.financeSetting.findUnique({ where: { chairmanId: cid } }).catch(() => null);
  if (!r) return d;
  let bank: Bank = {}; try { bank = JSON.parse(r.bankJson); } catch { bank = {}; }
  return { bank, blockAdmitCard: r.blockAdmitCard, blockRegistration: r.blockRegistration, blockDegree: r.blockDegree, minDue: r.minDue };
}
export async function saveFinanceSetting(cid: string, s: FinSetting) {
  const data = { bankJson: JSON.stringify(s.bank), blockAdmitCard: s.blockAdmitCard, blockRegistration: s.blockRegistration, blockDegree: s.blockDegree, minDue: Math.max(0, s.minDue || 0), updatedAt: new Date() };
  await fdb.financeSetting.upsert({ where: { chairmanId: cid }, create: { chairmanId: cid, ...data }, update: data });
}

/** Outstanding fee of a student (all invoices). */
export async function dueOf(studentId: string) {
  const inv = (await edb.feeInvoice.findMany({ where: { studentId, status: { in: ["UNPAID", "PARTIAL"] } } }).catch(() => [])) as { amount: number; discount: number; fine: number; paid: number }[];
  return inv.reduce((a, i) => a + Math.max(0, balanceOf(i)), 0);
}

/** A message when an unpaid fee holds this back for the student, else null. */
export async function feeBlock(studentId: string, what: "admitCard" | "registration" | "degree"): Promise<string | null> {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  const set = await financeSetting(s?.batch.coordinator.managedById);
  const on = what === "admitCard" ? set.blockAdmitCard : what === "registration" ? set.blockRegistration : set.blockDegree;
  if (!on) return null;
  const due = await dueOf(studentId);
  if (due <= set.minDue) return null;
  return `Fee outstanding: Rs ${due.toLocaleString("en-PK")}. ${what === "admitCard" ? "The admit card" : what === "registration" ? "Registration" : "The degree"} is held until it is paid (or Finance clears it).`;
}

export async function claimPayment(student: { id: string; name: string }, invoiceId: string, method: string, reference: string, amount: number, paidOn: string) {
  const inv = (await edb.feeInvoice.findFirst({ where: { id: invoiceId, studentId: student.id } })) as { id: string; chairmanId: string; amount: number; discount: number; fine: number; paid: number } | null;
  if (!inv) throw new Error("Invoice not found.");
  if (!METHODS.some(([m]) => m === method)) throw new Error("Choose how you paid.");
  const ref = reference.trim().replace(/\s+/g, "").slice(0, 60);
  if (ref.length < 5) throw new Error("Enter the transaction / deposit slip number.");
  if (!(amount > 0) || amount > balanceOf(inv) + 1) throw new Error(`Amount must be between 1 and Rs ${balanceOf(inv).toLocaleString("en-PK")}.`);
  try { await fdb.paymentClaim.create({ data: { id: randomUUID(), chairmanId: inv.chairmanId, invoiceId: inv.id, studentId: student.id, amount: Math.round(amount), method, reference: ref, paidOn: paidOn ? new Date(paidOn) : null } }); }
  catch (e) { if (/Unique|P2002/.test((e as Error).message)) throw new Error("This transaction number has already been entered."); throw e; }
  const fin = await prisma.user.findMany({ where: { role: "FINANCE_OFFICER", isActive: true, OR: [{ managedById: inv.chairmanId }, { managedBy: { managedById: inv.chairmanId } }] }, select: { id: true } });
  await notifyUsers(fin.length ? fin.map((f) => f.id) : [inv.chairmanId], { kind: "REQUEST", title: `Fee payment to verify: Rs ${Math.round(amount).toLocaleString("en-PK")}`, body: `${student.name} — ${method} ${ref}`, href: "/fees?tab=claims" });
}

export async function decideClaim(cid: string, by: string, id: string, ok: boolean, note: string) {
  const c = (await fdb.paymentClaim.findFirst({ where: { id, chairmanId: cid, status: "PENDING" } })) as { id: string; invoiceId: string; studentId: string; amount: number; method: string; reference: string } | null;
  if (!c) throw new Error("Not waiting for a decision.");
  if (!ok && note.trim().length < 3) throw new Error("Say why it is rejected (e.g. not found in the bank statement).");
  await fdb.paymentClaim.update({ where: { id }, data: { status: ok ? "VERIFIED" : "REJECTED", note: note || null, decidedById: by } });
  const { tellStudents } = await import("./studentAlerts");
  if (ok) {
    const inv = (await edb.feeInvoice.findUnique({ where: { id: c.invoiceId } })) as { id: string; amount: number; discount: number; fine: number; paid: number };
    await edb.feePayment.create({ data: { invoiceId: inv.id, amount: c.amount, method: "ONLINE", reference: `${c.method} ${c.reference}`, receivedById: by } });
    const next = { ...inv, paid: inv.paid + c.amount };
    await edb.feeInvoice.update({ where: { id: inv.id }, data: { paid: next.paid, status: statusOf(next) } });
    await post(cid, by, `Fee received (${c.method.toLowerCase()})`, [["1010", c.amount, 0], ["1100", 0, c.amount]], "FEE_PAYMENT", inv.id);
    await tellStudents([c.studentId], "FEE", `Payment verified: Rs ${c.amount.toLocaleString("en-PK")}`, `Remaining: Rs ${Math.max(0, balanceOf(next)).toLocaleString("en-PK")}.`, "/student/fees");
  } else await tellStudents([c.studentId], "FEE", "Payment could not be verified", `${c.method} ${c.reference}: ${note}`, "/student/fees");
}
