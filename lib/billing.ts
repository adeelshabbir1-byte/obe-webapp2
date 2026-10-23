import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { forgetLocks } from "./moduleLocks";
import { MODULE_KEYS, moduleForPath } from "./modules";

// Billing for institutes. The Super User keeps plans (modules, price per student or flat, period) and each institute's
// subscription (trial, discount, grace). Invoices are made each period; payments are recorded against them. When an
// invoice stays unpaid past the grace period, the plan's modules turn read-only (pages open, nothing can be saved);
// after the read-only days they are locked through the existing module-lock system. Paying unlocks them at once.

export const bdb = prisma as unknown as Record<string, any>;
export const BILL_HINT = "Run prisma/migration_billing.sql in Supabase first.";
export const PERIODS: Record<string, string> = { MONTHLY: "Monthly", TERM: "Each term (6 months)", YEARLY: "Yearly" };
export type Plan = { id: string; name: string; modulesJson: string; pricing: string; price: number; period: string; active: boolean; note: string | null };
export type Sub = { chairmanId: string; planId: string; status: string; trialEndsAt: Date | null; startDate: Date; discountPct: number; discountNote: string | null; graceDays: number; readOnlyDays: number; billingEmail: string | null; lockState: string; lockedByBillingJson: string; lockChangedAt: Date | null };
export type Invoice = { id: string; chairmanId: string; number: string; planId: string | null; periodStart: Date; periodEnd: Date; issuedAt: Date; dueAt: Date; students: number; amount: number; discount: number; total: number; status: string; paidAt: Date | null; linesJson: string; remindedAt: Date | null };

/** The billing period that contains a date. */
export function periodOf(period: string, d = new Date()): [Date, Date] {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  // The end is the last day of the period (midday UTC, so it shows as that day in every time zone).
  if (period === "MONTHLY") return [new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0, 12))];
  if (period === "YEARLY") return [new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31, 12))];
  const h = m < 6 ? 0 : 6; return [new Date(Date.UTC(y, h, 1)), new Date(Date.UTC(y, h + 6, 0, 12))];
}
export async function activeStudents(chairmanId: string) {
  return prisma.student.count({ where: { batch: { coordinator: { managedById: chairmanId } }, status: { in: ["ACTIVE", "PROBATION", "FROZEN"] } } as never });
}
/** Usage: students, staff and files stored (evidence, minutes, uploads) for an institute. */
export async function usageOf(chairmanId: string) {
  const [students, staff] = await Promise.all([activeStudents(chairmanId), prisma.user.count({ where: { isActive: true, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] } })]);
  let bytes = 0;
  try {
    const r = (await prisma.$queryRawUnsafe(`SELECT COALESCE((SELECT SUM("size") FROM "EvidenceFile" WHERE "chairmanId" = $1), 0) + COALESCE((SELECT SUM(octet_length("data")) * 3 / 4 FROM "MeetingMinutes" WHERE "chairmanId" = $1 AND "data" IS NOT NULL), 0) AS b`, chairmanId)) as { b: bigint | number }[];
    bytes = Number(r[0]?.b || 0);
  } catch { bytes = 0; }
  return { students, staff, storageMb: Math.round((bytes / 1048576) * 10) / 10 };
}

async function nextNumber(d: Date) {
  const prefix = `INV-${d.getUTCFullYear()}-`;
  const n = await bdb.billingInvoice.count({ where: { number: { startsWith: prefix } } });
  for (let i = n + 1; i < n + 1000; i++) { const num = `${prefix}${String(i).padStart(4, "0")}`; if (!(await bdb.billingInvoice.count({ where: { number: num } }))) return num; }
  return `${prefix}${randomUUID().slice(0, 6)}`;
}
/** The invoice for the current period, if the institute does not have one yet (trials are not billed). */
export async function invoiceFor(chairmanId: string, by: string | null, now = new Date()): Promise<Invoice | null> {
  const s = (await bdb.subscription.findUnique({ where: { chairmanId } })) as Sub | null;
  if (!s || s.status === "CANCELLED" || (s.status === "TRIAL" && s.trialEndsAt && new Date(s.trialEndsAt) > now)) return null;
  const p = (await bdb.billingPlan.findUnique({ where: { id: s.planId } })) as Plan | null;
  if (!p) return null;
  const [start, end] = periodOf(p.period, now);
  const have = (await bdb.billingInvoice.findFirst({ where: { chairmanId, periodStart: start, status: { not: "VOID" } } })) as Invoice | null;
  if (have) return null;
  const students = await activeStudents(chairmanId);
  const amount = p.pricing === "FLAT" ? p.price : p.price * students;
  const discount = Math.round(amount * (s.discountPct || 0)) / 100;
  const lines = [{ text: `${p.name} — ${PERIODS[p.period]} ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`, qty: p.pricing === "FLAT" ? 1 : students, rate: p.price, amount }, ...(discount ? [{ text: `Discount ${s.discountPct}%${s.discountNote ? ` (${s.discountNote})` : ""}`, qty: 1, rate: -discount, amount: -discount }] : [])];
  const inv = { id: randomUUID(), chairmanId, number: await nextNumber(now), planId: p.id, periodStart: start, periodEnd: end, issuedAt: now, dueAt: new Date(now.getTime() + 15 * 864e5), students, amount, discount, total: Math.round((amount - discount) * 100) / 100, status: "DUE", linesJson: JSON.stringify(lines), createdById: by };
  await bdb.billingInvoice.create({ data: inv });
  if (s.status === "TRIAL") await bdb.subscription.update({ where: { chairmanId }, data: { status: "ACTIVE" } });
  await notifyUsers([chairmanId], { kind: "BILLING", title: `OBEHUB invoice ${inv.number}: Rs ${inv.total.toLocaleString("en-PK")}`, body: `Due ${inv.dueAt.toLocaleDateString("en-GB")}.`, href: "/billing" });
  return inv as unknown as Invoice;
}

/** Record a payment; once nothing is overdue the billing locks are lifted. */
export async function recordPayment(by: string, invoiceId: string, o: { amount: number; method: string; reference: string; paidOn: Date }) {
  const inv = (await bdb.billingInvoice.findUnique({ where: { id: invoiceId } })) as Invoice | null;
  if (!inv || inv.status === "VOID") throw new Error("Not found.");
  if (!(o.amount > 0)) throw new Error("Give the amount received.");
  await bdb.billingPayment.create({ data: { id: randomUUID(), invoiceId, chairmanId: inv.chairmanId, amount: o.amount, method: o.method, reference: o.reference || null, paidOn: o.paidOn, recordedById: by } });
  const paid = ((await bdb.billingPayment.findMany({ where: { invoiceId }, select: { amount: true } })) as { amount: number }[]).reduce((t, p) => t + p.amount, 0);
  if (paid + 0.5 >= inv.total) await bdb.billingInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: o.paidOn } });
  await applyLocks(inv.chairmanId);
  return { paid, balance: Math.max(0, Math.round((inv.total - paid) * 100) / 100) };
}

/** The lock an institute should be in now, from its oldest unpaid invoice; applied through the module-lock system. */
export async function applyLocks(chairmanId: string, now = new Date()) {
  const s = (await bdb.subscription.findUnique({ where: { chairmanId } })) as Sub | null;
  if (!s) return "NONE";
  const plan = (await bdb.billingPlan.findUnique({ where: { id: s.planId } })) as Plan | null;
  const unpaid = (await bdb.billingInvoice.findMany({ where: { chairmanId, status: { in: ["DUE", "OVERDUE"] } }, orderBy: { dueAt: "asc" } })) as Invoice[];
  for (const i of unpaid) if (i.status === "DUE" && new Date(i.dueAt) < now) await bdb.billingInvoice.update({ where: { id: i.id }, data: { status: "OVERDUE" } });
  const late = unpaid[0] ? Math.floor((now.getTime() - new Date(unpaid[0].dueAt).getTime()) / 864e5) : -1;
  const state = s.status === "SUSPENDED" ? "LOCKED" : late > s.graceDays + s.readOnlyDays ? "LOCKED" : late > s.graceDays ? "READ_ONLY" : "NONE";
  const modules = (JSON.parse(plan?.modulesJson || "[]") as string[]).filter((k) => MODULE_KEYS.includes(k as never));
  const lic = await bdb.instituteLicense.findUnique({ where: { chairmanId } }).catch(() => null);
  const current = new Set<string>(JSON.parse(lic?.lockedJson || "[]"));
  const byBilling = new Set<string>(JSON.parse(s.lockedByBillingJson || "[]"));
  if (state === "LOCKED") { for (const k of modules) if (!current.has(k)) { current.add(k); byBilling.add(k); } }
  else { for (const k of byBilling) current.delete(k); byBilling.clear(); }
  const lockedJson = JSON.stringify(Array.from(current));
  if (lockedJson !== (lic?.lockedJson || "[]")) {
    await bdb.instituteLicense.upsert({ where: { chairmanId }, create: { chairmanId, lockedJson, note: "Locked for an unpaid OBEHUB invoice" }, update: { lockedJson } }).catch(() => {});
    forgetLocks(chairmanId);
  }
  if (state !== s.lockState || JSON.stringify(Array.from(byBilling)) !== s.lockedByBillingJson) {
    await bdb.subscription.update({ where: { chairmanId }, data: { lockState: state, lockedByBillingJson: JSON.stringify(Array.from(byBilling)), lockChangedAt: now } });
    readOnlyCache.delete(chairmanId);
    if (state !== s.lockState) await notifyUsers([chairmanId], { kind: "BILLING", title: state === "NONE" ? "Thank you — all OBEHUB modules are open again" : state === "READ_ONLY" ? "OBEHUB invoice overdue: modules are read-only" : "OBEHUB invoice overdue: modules are locked", body: state === "NONE" ? "Payment received." : `Invoice ${unpaid[0]?.number} is ${late} days overdue. Pay it to ${state === "READ_ONLY" ? "keep saving work" : "open the modules again"}.`, href: "/billing" });
  }
  return state;
}

// Read-only modules for the request check in lib/session.ts (cached for a minute).
const readOnlyCache = new Map<string, { at: number; keys: Set<string> }>();
export async function readOnlyModules(chairmanId: string | null): Promise<Set<string>> {
  if (!chairmanId) return new Set();
  const hit = readOnlyCache.get(chairmanId);
  if (hit && Date.now() - hit.at < 60_000) return hit.keys;
  let keys = new Set<string>();
  try {
    const s = (await bdb.subscription.findUnique({ where: { chairmanId }, select: { lockState: true, planId: true } })) as { lockState: string; planId: string } | null;
    if (s?.lockState === "READ_ONLY") { const p = await bdb.billingPlan.findUnique({ where: { id: s.planId }, select: { modulesJson: true } }); keys = new Set(JSON.parse(p?.modulesJson || "[]")); }
  } catch { /* migration_billing.sql not run */ }
  readOnlyCache.set(chairmanId, { at: Date.now(), keys });
  return keys;
}
/** A change (not a read) to a read-only module: refused. */
export async function blockedWrite(chairmanId: string | null, path: string, method: string) {
  if (!chairmanId || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) || !path.startsWith("/api/")) return null;
  const m = moduleForPath(path);
  return m && (await readOnlyModules(chairmanId)).has(m.key) ? m.key : null;
}

/** For the Institute Head's banner: overdue invoices and the lock. */
export async function billingNotice(chairmanId: string) {
  try {
    const s = (await bdb.subscription.findUnique({ where: { chairmanId } })) as Sub | null;
    if (!s) return null;
    const overdue = (await bdb.billingInvoice.findMany({ where: { chairmanId, status: "OVERDUE" }, orderBy: { dueAt: "asc" } })) as Invoice[];
    const trialLeft = s.status === "TRIAL" && s.trialEndsAt ? Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 864e5) : null;
    if (!overdue.length && s.lockState === "NONE" && (trialLeft === null || trialLeft > 14)) return null;
    return { lockState: s.lockState, overdue: overdue.map((i) => ({ number: i.number, total: i.total, dueAt: i.dueAt })), trialLeft, graceLeft: overdue[0] ? s.graceDays - Math.floor((Date.now() - new Date(overdue[0].dueAt).getTime()) / 864e5) : null };
  } catch { return null; }
}

/** Daily: invoices for the new period, reminders 3 days before the due date, overdue marking and the locks. */
export async function runBilling(now = new Date()) {
  try { await bdb.subscription.count(); } catch { return { skipped: BILL_HINT }; }
  const subs = (await bdb.subscription.findMany({ where: { status: { not: "CANCELLED" } } })) as Sub[];
  let invoiced = 0, reminded = 0;
  for (const s of subs) {
    if (await invoiceFor(s.chairmanId, null, now).catch(() => null)) invoiced++;
    const soon = (await bdb.billingInvoice.findMany({ where: { chairmanId: s.chairmanId, status: "DUE", remindedAt: null, dueAt: { lte: new Date(now.getTime() + 3 * 864e5) } } })) as Invoice[];
    for (const i of soon) { await notifyUsers([s.chairmanId], { kind: "BILLING", title: `Reminder: OBEHUB invoice ${i.number} is due ${new Date(i.dueAt).toLocaleDateString("en-GB")}`, body: `Rs ${i.total.toLocaleString("en-PK")}`, href: "/billing" }); await bdb.billingInvoice.update({ where: { id: i.id }, data: { remindedAt: now } }); reminded++; }
    await applyLocks(s.chairmanId, now).catch(() => null);
  }
  return { invoiced, reminded, institutes: subs.length };
}

/** Revenue: invoiced and received per month (last 12 months), outstanding, per plan. */
export async function revenue() {
  const since = new Date(Date.now() - 365 * 864e5);
  const [invs, pays, plans] = await Promise.all([
    bdb.billingInvoice.findMany({ where: { issuedAt: { gte: since }, status: { not: "VOID" } } }) as Promise<Invoice[]>,
    bdb.billingPayment.findMany({ where: { paidOn: { gte: since } } }) as Promise<{ amount: number; paidOn: Date }[]>,
    bdb.billingPlan.findMany({}) as Promise<Plan[]>,
  ]);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11 + i); return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) }; });
  const k = (d: Date) => `${new Date(d).getUTCFullYear()}-${new Date(d).getUTCMonth()}`;
  const outstanding = ((await bdb.billingInvoice.findMany({ where: { status: { in: ["DUE", "OVERDUE"] } } })) as Invoice[]);
  return {
    months: months.map((m) => ({ label: m.label, invoiced: Math.round(invs.filter((i) => k(i.issuedAt) === m.key).reduce((t, i) => t + i.total, 0)), received: Math.round(pays.filter((p) => k(p.paidOn) === m.key).reduce((t, p) => t + p.amount, 0)) })),
    outstanding: Math.round(outstanding.reduce((t, i) => t + i.total, 0)), overdue: Math.round(outstanding.filter((i) => i.status === "OVERDUE").reduce((t, i) => t + i.total, 0)),
    byPlan: plans.map((p) => ({ name: p.name, invoiced: Math.round(invs.filter((i) => i.planId === p.id).reduce((t, i) => t + i.total, 0)) })).filter((p) => p.invoiced),
  };
}
