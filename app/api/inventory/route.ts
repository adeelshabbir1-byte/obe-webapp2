import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb, post } from "../../../lib/erp";

const clip = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Store: stock items, vendors, and stock moves (receive / issue / count correction). Issues are expensed at cost.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.inventory) return NextResponse.json({ error: "Only store staff manage inventory." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "addItem") {
      const code = clip(b.code, 40), name = clip(b.name);
      if (!code || !name) return NextResponse.json({ error: "Code and name are needed." }, { status: 400 });
      await edb.stockItem.upsert({ where: { chairmanId_code: { chairmanId: acc.chairmanId, code } }, create: { chairmanId: acc.chairmanId, code, name, category: clip(b.category, 60), unit: clip(b.unit, 20) || "pcs", location: clip(b.location, 80), reorderLevel: Number(b.reorderLevel) || 0, unitCost: Number(b.unitCost) || 0 }, update: { name, category: clip(b.category, 60), unit: clip(b.unit, 20) || "pcs", location: clip(b.location, 80), reorderLevel: Number(b.reorderLevel) || 0, ...(b.unitCost ? { unitCost: Number(b.unitCost) } : {}) } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "addVendor") {
      const name = clip(b.name);
      if (!name) return NextResponse.json({ error: "Vendor name is needed." }, { status: 400 });
      await edb.vendor.create({ data: { chairmanId: acc.chairmanId, name, phone: clip(b.phone, 30), email: clip(b.email), ntn: clip(b.ntn, 30), address: clip(b.address, 200) } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "move") {
      const item = (await edb.stockItem.findFirst({ where: { id: String(b.itemId || ""), chairmanId: acc.chairmanId } })) as { id: string; name: string; qty: number; unitCost: number } | null;
      if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });
      const kind = ["IN", "OUT", "ADJUST"].includes(b.kind) ? b.kind : "OUT";
      const n = Number(b.qty);
      if (!Number.isFinite(n) || (kind !== "ADJUST" && n <= 0)) return NextResponse.json({ error: "Enter a quantity." }, { status: 400 });
      // ADJUST sets the counted quantity; the move records the difference.
      const delta = kind === "IN" ? n : kind === "OUT" ? -n : n - item.qty;
      if (item.qty + delta < 0) return NextResponse.json({ error: `Only ${item.qty} in stock.` }, { status: 400 });
      await edb.stockItem.update({ where: { id: item.id }, data: { qty: item.qty + delta } });
      await edb.stockMove.create({ data: { itemId: item.id, qty: delta, kind, ref: clip(b.ref, 160), byId: user.id } });
      const value = Math.abs(delta) * item.unitCost;
      if (value > 0 && delta < 0) await post(acc.chairmanId, user.id, `${kind === "OUT" ? "Issued" : "Stock count shortfall"}: ${item.name} × ${Math.abs(delta)}${b.ref ? ` (${String(b.ref).slice(0, 60)})` : ""}`, [["5200", value, 0], ["1200", 0, value]], "STOCK", item.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Inventory is not set up yet — run prisma/migration_erp.sql." }, { status: 500 });
  }
}
