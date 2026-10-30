import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str, num } from "../../../lib/registers";
import { REFUND_HINT, canDecideRefunds, type Step } from "../../../lib/feeRefunds";
import { withErrors } from "../../../lib/apiHandler";

/** POST { action: "schedule", rows: "7:100, 15:50" } (head or Finance Officer)
 *  POST { action: "decide", id, approve, amount, note }   POST { action: "paid", id, paymentRef } (Finance Officer or head) */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !canDecideRefunds(w)) return NextResponse.json({ error: "Only the Finance Officer or the institute head handles refunds." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "schedule") {
      const steps: Step[] = String(b.rows || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => { const [d, p] = x.split(/[:=]/).map((y) => Number(y.trim())); return { uptoDay: d, pct: p }; });
      if (!steps.length || steps.some((s) => !(s.uptoDay > 0) || !(s.pct >= 0 && s.pct <= 100))) return NextResponse.json({ error: "Write the schedule as day:percent pairs, e.g. 7:100, 15:50." }, { status: 400 });
      await rdb.feeRefundRule.upsert({ where: { chairmanId: w.chairmanId }, create: { chairmanId: w.chairmanId, rulesJson: JSON.stringify(steps), updatedById: w.id }, update: { rulesJson: JSON.stringify(steps), updatedById: w.id, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: w.id, action: "FEE_REFUND_SCHEDULE", entityType: "FeeRefundRule", entityId: w.chairmanId, metadata: { steps: steps.length } });
      return NextResponse.json({ ok: true });
    }
    const c = await rdb.feeRefundCase.findUnique({ where: { id: String(b.id || "") } });
    if (!c || c.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    if (b.action === "decide") {
      if (c.status !== "PENDING") return NextResponse.json({ error: "Already decided." }, { status: 400 });
      const amount = num(b.amount) ?? c.refundAmount;
      const note = str(b.note, 1000);
      if (amount !== c.refundAmount && !note) return NextResponse.json({ error: "Give the reason for changing the amount." }, { status: 400 });
      await rdb.feeRefundCase.update({ where: { id: c.id }, data: { status: b.approve ? "APPROVED" : "REJECTED", refundAmount: b.approve ? amount : c.refundAmount, decidedById: w.id, decidedAt: new Date(), note: note || c.note } });
      await writeAuditLog({ actorUserId: w.id, action: b.approve ? "FEE_REFUND_APPROVED" : "FEE_REFUND_REJECTED", entityType: "FeeRefundCase", entityId: c.id, metadata: { amount } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "paid") {
      if (c.status !== "APPROVED") return NextResponse.json({ error: "Approve the refund first." }, { status: 400 });
      await rdb.feeRefundCase.update({ where: { id: c.id }, data: { status: "PAID", paidAt: new Date(), paymentRef: str(b.paymentRef, 120) || null } });
      await writeAuditLog({ actorUserId: w.id, action: "FEE_REFUND_PAID", entityType: "FeeRefundCase", entityId: c.id, metadata: { amount: c.refundAmount } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? REFUND_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
