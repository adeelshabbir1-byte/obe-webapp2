import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb, post } from "../../../lib/erp";
import { parsePLines, pTotal, type PLine } from "../../../lib/purchasing";

type PR = { id: string; title: string; linesJson: string; total: number; status: string; requestedById: string; vendorId: string | null; poNumber: string | null };

// Purchasing: any staff member requests → Finance/Institute Head approve → store orders from a vendor (PO)
// → goods received into stock (Dr Inventory / Supplies, Cr Payables) → vendor paid (Dr Payables, Cr Bank).
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.chairmanId) return NextResponse.json({ error: "No institute." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "request") {
      const lines = parsePLines(b.lines);
      const title = typeof b.title === "string" ? b.title.trim().slice(0, 160) : "";
      if (!title || !lines.length) return NextResponse.json({ error: "Give a title and at least one line." }, { status: 400 });
      await edb.purchaseRequest.create({ data: { chairmanId: acc.chairmanId, requestedById: user.id, title, linesJson: JSON.stringify(lines), total: pTotal(lines), note: typeof b.note === "string" ? b.note.slice(0, 1000) : null } });
      return NextResponse.json({ ok: true });
    }
    const pr = (await edb.purchaseRequest.findFirst({ where: { id: String(b.id || ""), chairmanId: acc.chairmanId } })) as PR | null;
    if (!pr) return NextResponse.json({ error: "request not found" }, { status: 404 });
    const set = (data: Record<string, unknown>) => edb.purchaseRequest.update({ where: { id: pr.id }, data });
    if (b.action === "cancel" && pr.requestedById === user.id && pr.status === "REQUESTED") { await edb.purchaseRequest.delete({ where: { id: pr.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "decide") {
      if (!acc.approvePurchase) return NextResponse.json({ error: "Only Finance or the Institute Head approve purchases." }, { status: 403 });
      if (pr.status !== "REQUESTED") return NextResponse.json({ error: "Already decided." }, { status: 400 });
      await set({ status: b.approve ? "APPROVED" : "REJECTED", decidedById: user.id, ...(b.note ? { note: String(b.note).slice(0, 1000) } : {}) });
      return NextResponse.json({ ok: true });
    }
    if (!acc.inventory) return NextResponse.json({ error: "Only store staff order and receive." }, { status: 403 });
    if (b.action === "order") {
      if (pr.status !== "APPROVED") return NextResponse.json({ error: "Only approved requests can be ordered." }, { status: 400 });
      const v = await edb.vendor.findFirst({ where: { id: String(b.vendorId || ""), chairmanId: acc.chairmanId } });
      if (!v) return NextResponse.json({ error: "Choose a vendor (add one under Inventory)." }, { status: 400 });
      const n = await edb.purchaseRequest.count({ where: { chairmanId: acc.chairmanId, poNumber: { not: null } } });
      await set({ status: "ORDERED", vendorId: v.id, poNumber: `PO-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}` });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "receive") {
      if (pr.status !== "ORDERED") return NextResponse.json({ error: "Only ordered purchases can be received." }, { status: 400 });
      const lines = JSON.parse(pr.linesJson) as PLine[];
      let stock = 0, other = 0;
      for (const l of lines) {
        const item = l.code ? ((await edb.stockItem.findFirst({ where: { chairmanId: acc.chairmanId, code: l.code } })) as { id: string; qty: number; unitCost: number } | null) : null;
        const value = l.qty * l.unitCost;
        if (!item) { other += value; continue; }
        // Weighted average cost.
        const q = item.qty + l.qty;
        await edb.stockItem.update({ where: { id: item.id }, data: { qty: q, unitCost: q > 0 ? (item.qty * item.unitCost + value) / q : item.unitCost } });
        await edb.stockMove.create({ data: { itemId: item.id, qty: l.qty, kind: "IN", ref: pr.poNumber, byId: user.id } });
        stock += value;
      }
      const jl: [string, number, number][] = [];
      if (stock) jl.push(["1200", stock, 0]);
      if (other) jl.push(["5200", other, 0]);
      if (stock + other) { jl.push(["2000", 0, stock + other]); await post(acc.chairmanId, user.id, `Goods received ${pr.poNumber}: ${pr.title}`, jl, "PURCHASE", pr.id); }
      await set({ status: "RECEIVED" });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "pay") {
      if (!acc.finance) return NextResponse.json({ error: "Only Finance pays vendors." }, { status: 403 });
      if (pr.status !== "RECEIVED") return NextResponse.json({ error: "Pay after goods are received." }, { status: 400 });
      if (pr.total > 0) await post(acc.chairmanId, user.id, `Vendor paid ${pr.poNumber}${b.ref ? ` (${String(b.ref).slice(0, 60)})` : ""}`, [["2000", pr.total, 0], ["1010", 0, pr.total]], "PURCHASE_PAY", pr.id);
      await set({ status: "PAID" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Purchasing is not set up yet — run prisma/migration_erp.sql." }, { status: 500 });
  }
}
