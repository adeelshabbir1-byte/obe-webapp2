import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { runUndo } from "../../../lib/undo";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { token } — undo the person's own last action within 10 seconds (Adeel prompt §2).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = String(((await req.json().catch(() => ({}))) as { token?: string }).token || "");
  if (!token) return NextResponse.json({ error: "Nothing to undo." }, { status: 400 });
  const r = await runUndo(user.id, token);
  if (r.error) return NextResponse.json(r, { status: 410 });
  await writeAuditLog({ actorUserId: user.id, action: "UNDONE", metadata: { label: r.label || "" } }).catch(() => null);
  return NextResponse.json(r);
}
export const POST = withErrors(POST_handler);
