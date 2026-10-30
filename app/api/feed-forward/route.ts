import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { acknowledge } from "../../../lib/feedForward";
import { withErrors } from "../../../lib/apiHandler";

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, message: await acknowledge(user, String(b.courseId || ""), String(b.noteId || ""), String(b.checkpoint || ""), String(b.status || ""), String(b.comment || "").slice(0, 1500)) }); }
  catch (e) { const m = (e as Error).message; return NextResponse.json({ error: /does not exist|relation/.test(m) ? "Run the latest migration (System Health)." : m }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
