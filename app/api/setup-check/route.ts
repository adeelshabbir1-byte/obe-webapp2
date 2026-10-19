import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { createKey, revokeKey } from "../../../lib/integrationKeys";

// POST { action: "key", label } → a new API key (shown once) | { action: "revoke", id } — Institute Head only.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head manages API keys." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user);
  try {
    if (b.action === "key") { const key = await createKey(chairmanId, String(b.label || "Campus management system").slice(0, 80)); return NextResponse.json({ ok: true, message: `New key (copy it now, it is not shown again): ${key}` }); }
    if (b.action === "revoke") { await revokeKey(chairmanId, String(b.id || "")); return NextResponse.json({ ok: true }); }
  } catch { return NextResponse.json({ error: "Run prisma/migration_platform_plus.sql in Supabase first." }, { status: 500 }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
