import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "****";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const config = await prisma.aiConfig.findUnique({ where: { chairmanId: user.id } });
  if (!config) return NextResponse.json({ config: null });

  return NextResponse.json({
    config: {
      provider: config.provider, model: config.model, enabled: config.enabled,
      apiKeyMasked: maskKey(config.apiKey), hasKey: !!config.apiKey,
      lastTestedAt: config.lastTestedAt, lastTestOk: config.lastTestOk, lastTestNote: config.lastTestNote,
    },
  });
}

// Body: { provider?, model?, apiKey?, enabled? } — apiKey is only
// updated if provided (so re-saving other fields doesn't require
// re-entering the key); pass an empty string to clear it.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const existing = await prisma.aiConfig.findUnique({ where: { chairmanId: user.id } });

  const data: any = {
    provider: body.provider ?? existing?.provider ?? "anthropic",
    model: body.model ?? existing?.model ?? "claude-sonnet-4-6",
    enabled: body.enabled ?? existing?.enabled ?? false,
  };
  if (body.apiKey !== undefined) {
    data.apiKey = body.apiKey || null;
    data.lastTestedAt = null; data.lastTestOk = null; data.lastTestNote = null; // key changed, old test result is stale
  }

  const config = await prisma.aiConfig.upsert({
    where: { chairmanId: user.id },
    update: data,
    create: { chairmanId: user.id, ...data },
  });

  await writeAuditLog({ actorUserId: user.id, action: "AI_CONFIG_UPDATED", entityType: "AiConfig", entityId: config.id, metadata: { provider: config.provider, model: config.model, enabled: config.enabled, keyChanged: body.apiKey !== undefined } });

  return NextResponse.json({ ok: true, apiKeyMasked: maskKey(config.apiKey) });
}
