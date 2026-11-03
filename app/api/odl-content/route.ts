import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import * as T from "../../../lib/teachingTools";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { courseId, action: module {n, ...fields} | sign {as: SE|ID, notes?} } — ODL content per lecture topic (ODL 7.iv–7.vi).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const ctx = await T.courseCtx(String(b.courseId || ""));
  const acc = ctx ? await T.contentAccess(user, ctx) : null;
  if (!ctx || acc !== "act") return NextResponse.json({ error: "Only the Subject Expert, the Instructional Designer or the Program Lead." }, { status: 403 });
  try {
    if (b.action === "module") { await T.saveModule(user, ctx, Number(b.n), b.data || {}); return NextResponse.json({ ok: true }); }
    if (b.action === "sign") { await T.signContent(user, ctx, b.as === "ID" ? "ID" : "SE", (await T.designerFor(ctx))?.id || null, b.notes ? String(b.notes).slice(0, 2000) : undefined); return NextResponse.json({ ok: true }); }
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /odlModule|odlContentReview|does not exist/.test(m) ? T.TOOLS_HINT : m }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
