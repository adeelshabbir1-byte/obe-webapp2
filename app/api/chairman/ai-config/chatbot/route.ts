import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// PUT { enabled, dailyLimit } — the Institute Head switches the OBE Assistant on/off and sets the daily question limit.
export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data = { chatbotEnabled: !!b.enabled, chatbotDailyLimit: Math.min(200, Math.max(1, Number(b.dailyLimit) || 20)) };
  try {
    await (prisma as unknown as Record<string, any>).aiConfig.upsert({ where: { chairmanId: user.id }, create: { chairmanId: user.id, ...data }, update: data });
  } catch { return NextResponse.json({ error: "Not set up yet — the Super User needs to run prisma/migration_obe_learning.sql." }, { status: 500 }); }
  await writeAuditLog({ actorUserId: user.id, action: "OBE_ASSISTANT_SETTINGS", entityType: "AiConfig", entityId: user.id, metadata: data }).catch(() => null);
  return NextResponse.json({ ok: true });
}
