import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { adminCan } from "../../../../lib/platformTeam";
import { preview, load, applyPending, undo, loadsOf, KINDS, type Kind } from "../../../../lib/officialContent";
import { withErrors } from "../../../../lib/apiHandler";

// Official content into QR-I, QR-II and Discrete Structures (Super Admin / curriculum team).
// GET ?chairmanId= — each course's preview and the loads; POST { action: preview | load | apply | undo, chairmanId, kind, outline, id }.
async function who() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "CURRICULUM"))) return null;
  return user;
}
async function GET_handler(req: NextRequest) {
  const user = await who();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = req.nextUrl.searchParams.get("chairmanId") || "";
  if (!chairmanId) return NextResponse.json({ error: "Choose the institute." }, { status: 400 });
  const previews = await Promise.all((Object.keys(KINDS) as Kind[]).map((k) => preview(chairmanId, k, null)));
  return NextResponse.json({ previews, loads: await loadsOf(chairmanId) });
}
async function POST_handler(req: NextRequest) {
  const user = await who();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = String(b.chairmanId || "");
  const kind = String(b.kind || "") as Kind;
  const outline = typeof b.outline === "string" && b.outline.trim() ? b.outline.slice(0, 500_000) : null;
  const needKind = () => { if (!chairmanId) throw new Error("Choose the institute."); if (!KINDS[kind]) throw new Error("Choose the course."); };
  try {
    switch (b.action) {
      case "preview": needKind(); return NextResponse.json(await preview(chairmanId, kind, outline, b.courseId ? String(b.courseId) : null));
      case "load": needKind(); return NextResponse.json({ ok: true, ...(await load(user, chairmanId, kind, outline, b.courseId ? String(b.courseId) : null)) });
      case "apply": return NextResponse.json({ ok: true, ...(await applyPending(user, String(b.id))) });
      case "undo": return NextResponse.json({ ok: true, ...(await undo(user, String(b.id))) });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    if ((e as { code?: string }).code) throw e; // database errors: the shared handler explains them
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
