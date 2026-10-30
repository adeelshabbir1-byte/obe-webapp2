import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { saveTitles, TITLES_HINT } from "../../../../lib/titles";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { titles: [{ key, title, enabled }] } — the Institute Head names the institute's positions and switches off the
// ones it does not have.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets the position titles." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!Array.isArray(b.titles)) return NextResponse.json({ error: "titles are required" }, { status: 400 });
  const rows = (b.titles as { key?: unknown; title?: unknown; enabled?: unknown }[]).map((t) => ({ key: String(t.key || ""), title: String(t.title || ""), enabled: t.enabled !== false }));
  try {
    await saveTitles(user.id, rows, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "POSITION_TITLES_SET", entityType: "User", entityId: user.id, metadata: { titles: rows.map((t) => `${t.key}=${t.title}${t.enabled ? "" : " (off)"}`).join(", ").slice(0, 900) } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: TITLES_HINT }, { status: 503 });
  }
}
export const POST = withErrors(POST_handler);
