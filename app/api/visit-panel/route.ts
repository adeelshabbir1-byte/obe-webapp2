import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { govScope, inScope } from "../../../lib/accreditation/governance";
import { createPass, revokePass } from "../../../lib/visitorPass";
import { writeAuditLog } from "../../../lib/audit";

// POST { action: "create", cycleId, days, label } → a read-only panel link | { action: "revoke", id, cycleId }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  const b = await req.json().catch(() => ({}));
  const c = await prisma.accreditationCycle.findUnique({ where: { id: String(b.cycleId || "") } }).catch(() => null);
  if (!user || !s || !c || !inScope(s, c) || !(s.canManage || c.leadId === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (b.action === "create") {
      const days = Math.max(1, Math.min(30, Number(b.days) || 7));
      const token = await createPass(c.id, days, user.id, String(b.label || "Visiting panel").slice(0, 80));
      await writeAuditLog({ actorUserId: user.id, action: "VISITOR_PASS_CREATED", entityType: "AccreditationCycle", entityId: c.id, metadata: { days } });
      const base = req.nextUrl.origin;
      return NextResponse.json({ ok: true, message: `${base}/visit-panel/${token} (read-only, valid ${days} day${days > 1 ? "s" : ""})` });
    }
    if (b.action === "revoke") { await revokePass(String(b.id || "")); return NextResponse.json({ ok: true }); }
  } catch { return NextResponse.json({ error: "Run prisma/migration_platform_plus.sql in Supabase first." }, { status: 500 }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
