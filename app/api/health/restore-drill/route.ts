import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// The monthly restore drill (scripts/restore-drill.ts, GitHub Actions) records its result here with CRON_SECRET;
// System Health shows "Last restore test: <date> · passed".
async function POST_handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  await (prisma as unknown as Record<string, any>).restoreDrill.create({ data: { id: randomUUID(), passed: !!b.passed, source: "github-actions", summary: String(b.summary || "").slice(0, 300), detailJson: JSON.stringify(b.detail || {}).slice(0, 20000) } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
