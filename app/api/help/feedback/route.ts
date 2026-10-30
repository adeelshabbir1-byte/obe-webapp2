import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { helpViewer } from "../../../../lib/help/access";
import { withErrors } from "../../../../lib/apiHandler";

// POST { key, helpful, audience } — "Was this helpful?". One vote per person per article; voting again changes it.
async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const viewer = await helpViewer(b.audience === "student" ? "student" : "staff");
  if (!viewer) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  const key = String(b.key || "").slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(key) || typeof b.helpful !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const voterKey = `${viewer.kind}:${viewer.id}`;
  try {
    await prisma.helpFeedback.upsert({
      where: { articleKey_voterKey: { articleKey: key, voterKey } },
      update: { helpful: b.helpful },
      create: { articleKey: key, voterKey, helpful: b.helpful, role: viewer.role, chairmanId: viewer.chairmanId },
    });
  } catch {
    return NextResponse.json({ error: "Feedback isn't available yet — run prisma/migration_help_center.sql." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
