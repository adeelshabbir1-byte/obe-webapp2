import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { tdb, BADGES, badgesOf } from "../../../../lib/training";
import { notifyUsers } from "../../../../lib/notifications";

// Institute Head: turn the certification rule on, set the grace date, exempt people, remind those not certified.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets the training rule." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "save") {
      const grace = b.graceUntil ? new Date(b.graceUntil) : null;
      await tdb.trainingPolicy.upsert({ where: { chairmanId: user.id }, create: { chairmanId: user.id, enabled: !!b.enabled, graceUntil: grace }, update: { enabled: !!b.enabled, graceUntil: grace } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "exempt") {
      const p = (await tdb.trainingPolicy.findUnique({ where: { chairmanId: user.id } })) as { exemptJson: string } | null;
      let ex: string[] = []; try { ex = JSON.parse(p?.exemptJson || "[]"); } catch { ex = []; }
      const id = String(b.userId || ""); ex = b.on ? Array.from(new Set([...ex, id])) : ex.filter((x) => x !== id);
      await tdb.trainingPolicy.upsert({ where: { chairmanId: user.id }, create: { chairmanId: user.id, exemptJson: JSON.stringify(ex) }, update: { exemptJson: JSON.stringify(ex) } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remind") {
      const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never[] }, OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }] }, select: { id: true, role: true } });
      const have = await badgesOf(staff.map((s) => s.id));
      const need = staff.filter((s) => !have.get(s.id)?.has(s.role === "SUBJECT_EXPERT" ? "DESIGNER" : "BASICS")).map((s) => s.id);
      await notifyUsers(need, { kind: "DEADLINE", title: "Complete your OBE certification", body: "Study the Learn OBE lessons and pass the certification exam for your role.", href: "/learn/certification" });
      return NextResponse.json({ ok: true, note: `Reminded ${need.length} people.` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_training.sql first." }, { status: 500 }); }
}
void BADGES;
