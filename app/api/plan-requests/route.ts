import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { decideRequest } from "../../../lib/planRequests";
import { withErrors } from "../../../lib/apiHandler";

// POST { id, approve: boolean, note? } — the Program Lead / HOD / Chairman / Dean decides a degree plan request.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { await decideRequest(String(b.id || ""), !!b.approve, b.note ? String(b.note).slice(0, 500) : null, user); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
