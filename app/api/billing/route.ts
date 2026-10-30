import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { str, num, dateOrNull } from "../../../lib/registers";
import { PdfDoc } from "../../../lib/pdfDoc";
import { MODULE_KEYS } from "../../../lib/modules";
import { bdb, BILL_HINT, PERIODS, invoiceFor, recordPayment, applyLocks, type Invoice, type Plan } from "../../../lib/billing";
import { adminCan } from "../../../lib/platformTeam";
import { itAccess } from "../../../lib/itManager";
import { withErrors } from "../../../lib/apiHandler";

/** GET ?invoice=<id> — the invoice as a PDF (the Super User, or the institute's own Head). */
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("invoice") || "";
  try {
    const inv = (await bdb.billingInvoice.findUnique({ where: { id } })) as Invoice | null;
    const it = await itAccess(user);
    if (!inv || !(user.role === "SUPER_USER" || it?.chairmanId === inv.chairmanId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const head = await prisma.user.findUnique({ where: { id: inv.chairmanId }, select: { name: true, instituteName: true, email: true } });
    const pays = (await bdb.billingPayment.findMany({ where: { invoiceId: inv.id }, orderBy: { paidOn: "asc" } })) as { amount: number; method: string; reference: string | null; paidOn: Date }[];
    const d = await PdfDoc.create(`OBEHUB invoice ${inv.number}`);
    d.title(`Invoice ${inv.number}`, `OBEHUB — Lets Innovate Pvt Ltd · issued ${new Date(inv.issuedAt).toLocaleDateString("en-GB")} · due ${new Date(inv.dueAt).toLocaleDateString("en-GB")}`);
    d.kv([["Billed to", `${head?.instituteName || "Institute"} (${head?.name || ""})`], ["Period", `${new Date(inv.periodStart).toLocaleDateString("en-GB")} – ${new Date(inv.periodEnd).toLocaleDateString("en-GB")}`], ["Active students", inv.students], ["Status", inv.status === "PAID" ? `Paid on ${new Date(inv.paidAt!).toLocaleDateString("en-GB")}` : inv.status.toLowerCase()]]);
    const lines = JSON.parse(inv.linesJson || "[]") as { text: string; qty: number; rate: number; amount: number }[];
    d.table([["Item", 6], ["Quantity", 1.4], ["Rate (Rs)", 1.6], ["Amount (Rs)", 1.8]], [...lines.map((l) => [l.text, l.qty, l.rate.toLocaleString("en-PK"), l.amount.toLocaleString("en-PK")]), ["Total", "", "", inv.total.toLocaleString("en-PK")]]);
    if (pays.length) { d.h2("Payments received"); d.table([["Date", 2], ["Method", 2], ["Reference", 3], ["Amount (Rs)", 2]], pays.map((p) => [new Date(p.paidOn).toLocaleDateString("en-GB"), p.method.replace("_", " ").toLowerCase(), p.reference || "—", p.amount.toLocaleString("en-PK")])); }
    d.note("Please pay by bank transfer quoting the invoice number. Modules stay fully available while the invoice is within its grace period.");
    return new NextResponse(Buffer.from(await d.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"` } });
  } catch { return NextResponse.json({ error: BILL_HINT }, { status: 500 }); }
}

/**
 * POST { action, ... } — the Super User only.
 *   plan { id?, name, modules (comma separated or array), pricing, price, period, active, note }
 *   subscribe { chairmanId, planId, status, trialEndsAt, discountPct, discountNote, graceDays, readOnlyDays, billingEmail }
 *   invoiceNow { chairmanId }   pay { invoiceId, amount, method, reference, paidOn }   void { invoiceId, note }   suspend { chairmanId, on }
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "BILLING"))) return NextResponse.json({ error: "Only the Super User manages billing." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "plan": {
        const name = str(b.name, 120); if (name.length < 2) return NextResponse.json({ error: "Name the plan." }, { status: 400 });
        const mods = (Array.isArray(b.modules) ? b.modules : str(b.modules, 2000).split(",")).map((x: string) => String(x).trim()).filter((k: string) => MODULE_KEYS.includes(k as never));
        const data = { name, modulesJson: JSON.stringify(mods), pricing: b.pricing === "FLAT" ? "FLAT" : "PER_STUDENT", price: Math.max(0, num(b.price) || 0), period: PERIODS[str(b.period)] ? str(b.period) : "TERM", active: b.active !== false && b.active !== "false", note: str(b.note, 500) || null };
        if (b.id) await bdb.billingPlan.update({ where: { id: str(b.id) }, data }); else await bdb.billingPlan.create({ data: { id: randomUUID(), ...data } });
        return NextResponse.json({ ok: true });
      }
      case "subscribe": {
        const chairmanId = str(b.chairmanId);
        if (!(await prisma.user.count({ where: { id: chairmanId, role: "CHAIRMAN" } }))) return NextResponse.json({ error: "Choose an institute." }, { status: 400 });
        const plan = (await bdb.billingPlan.findUnique({ where: { id: str(b.planId) } })) as Plan | null; if (!plan) return NextResponse.json({ error: "Choose a plan." }, { status: 400 });
        const data = { planId: plan.id, status: ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"].includes(str(b.status)) ? str(b.status) : "TRIAL", trialEndsAt: dateOrNull(b.trialEndsAt), discountPct: Math.max(0, Math.min(100, num(b.discountPct) || 0)), discountNote: str(b.discountNote, 200) || null, graceDays: Math.max(0, Math.min(90, num(b.graceDays) ?? 15)), readOnlyDays: Math.max(0, Math.min(90, num(b.readOnlyDays) ?? 15)), billingEmail: str(b.billingEmail, 160) || null, updatedById: user.id, updatedAt: new Date() };
        await bdb.subscription.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
        await applyLocks(chairmanId);
        await writeAuditLog({ actorUserId: user.id, action: "SUBSCRIPTION_SAVED", entityType: "Subscription", entityId: chairmanId, metadata: { plan: plan.name, status: data.status } });
        return NextResponse.json({ ok: true });
      }
      case "invoiceNow": { const inv = await invoiceFor(str(b.chairmanId), user.id); return NextResponse.json(inv ? { ok: true, message: `Invoice ${inv.number}: Rs ${inv.total.toLocaleString("en-PK")}.` } : { error: "Nothing to invoice: already invoiced for this period, or in a trial." }, { status: inv ? 200 : 400 }); }
      case "pay": {
        const r = await recordPayment(user.id, str(b.invoiceId), { amount: num(b.amount) || 0, method: ["BANK_TRANSFER", "CHEQUE", "CASH", "GATEWAY"].includes(str(b.method)) ? str(b.method) : "BANK_TRANSFER", reference: str(b.reference, 120), paidOn: dateOrNull(b.paidOn) || new Date() });
        await writeAuditLog({ actorUserId: user.id, action: "BILLING_PAYMENT", entityType: "BillingInvoice", entityId: str(b.invoiceId), metadata: { amount: num(b.amount) || 0 } });
        return NextResponse.json({ ok: true, message: r.balance ? `Recorded — Rs ${r.balance.toLocaleString("en-PK")} still due.` : "Recorded — the invoice is paid." });
      }
      case "void": {
        const inv = (await bdb.billingInvoice.findUnique({ where: { id: str(b.invoiceId) } })) as Invoice | null;
        if (!inv || inv.status === "PAID") return NextResponse.json({ error: "Only an unpaid invoice can be cancelled." }, { status: 400 });
        await bdb.billingInvoice.update({ where: { id: inv.id }, data: { status: "VOID" } }); await applyLocks(inv.chairmanId);
        await writeAuditLog({ actorUserId: user.id, action: "BILLING_INVOICE_VOID", entityType: "BillingInvoice", entityId: inv.id, metadata: { note: str(b.note, 200) } });
        return NextResponse.json({ ok: true });
      }
      case "suspend": { await bdb.subscription.update({ where: { chairmanId: str(b.chairmanId) }, data: { status: b.on === false || b.on === "false" ? "ACTIVE" : "SUSPENDED" } }); await applyLocks(str(b.chairmanId)); return NextResponse.json({ ok: true }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? BILL_HINT : m.slice(0, 300) }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
