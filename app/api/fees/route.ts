import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb, post } from "../../../lib/erp";
import { issueForBatch, statusOf } from "../../../lib/fees";

// Student fees (Institute Head / Finance): issue invoices per batch and term, discounts / scholarships, late fines, payments.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.finance) return NextResponse.json({ error: "Only Finance manages student fees." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "issue") {
      const due = new Date(String(b.dueDate || "") + "T00:00:00Z");
      if (!b.batchId || !b.termName || !(Number(b.termYear) > 2000) || isNaN(due.getTime())) return NextResponse.json({ error: "Choose the batch, term and due date." }, { status: 400 });
      const r = await issueForBatch(acc.chairmanId, user.id, String(b.batchId), String(b.termName), Number(b.termYear), due);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, made: r.made });
    }
    if (b.action === "lateFines") {
      const fine = Math.max(0, Number(b.fine) || 0);
      const late = (await edb.feeInvoice.findMany({ where: { chairmanId: acc.chairmanId, status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { lt: new Date() }, fine: 0 } })) as { id: string }[];
      for (const i of late) { await edb.feeInvoice.update({ where: { id: i.id }, data: { fine } }); await post(acc.chairmanId, user.id, "Late payment fine", [["1100", fine, 0], ["4030", 0, fine]], "FEE_FINE", i.id); }
      return NextResponse.json({ ok: true, fined: late.length });
    }
    const inv = (await edb.feeInvoice.findFirst({ where: { id: String(b.invoiceId || ""), chairmanId: acc.chairmanId } })) as { id: string; amount: number; discount: number; fine: number; paid: number; studentId: string } | null;
    if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
    if (b.action === "discount") {
      const pct = Math.min(100, Math.max(0, Number(b.pct) || 0));
      const discount = Math.round((inv.amount * pct) / 100);
      const delta = discount - inv.discount;
      const next = { ...inv, discount };
      await edb.feeInvoice.update({ where: { id: inv.id }, data: { discount, status: statusOf(next) } });
      if (delta) await post(acc.chairmanId, user.id, `Fee concession ${pct}%${b.reason ? ` — ${String(b.reason).slice(0, 80)}` : ""}`, delta > 0 ? [["5100", delta, 0], ["1100", 0, delta]] : [["1100", -delta, 0], ["5100", 0, -delta]], "FEE_DISCOUNT", inv.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "pay") {
      const amount = Math.round(Number(b.amount) || 0);
      if (amount <= 0) return NextResponse.json({ error: "Enter the amount received." }, { status: 400 });
      const method = ["CASH", "BANK", "ONLINE"].includes(b.method) ? b.method : "BANK";
      await edb.feePayment.create({ data: { invoiceId: inv.id, amount, method, reference: b.reference ? String(b.reference).slice(0, 80) : null, receivedById: user.id } });
      const next = { ...inv, paid: inv.paid + amount };
      await edb.feeInvoice.update({ where: { id: inv.id }, data: { paid: next.paid, status: statusOf(next) } });
      await post(acc.chairmanId, user.id, `Fee received (${method.toLowerCase()})`, [[method === "CASH" ? "1000" : "1010", amount, 0], ["1100", 0, amount]], "FEE_PAYMENT", inv.id);
      await (await import("../../../lib/studentAlerts")).tellStudents([inv.studentId], "FEE", `Fee received: Rs ${amount.toLocaleString("en-PK")}`, `Thank you. Remaining: Rs ${Math.max(0, inv.amount - inv.discount + inv.fine - next.paid).toLocaleString("en-PK")}.`, "/student/fees");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Fees are not set up yet — run prisma/migration_erp.sql." }, { status: 500 }); }
}
