import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { saveTemplate, deleteTemplate, editValue, touch, layoutOf, logOf, templatesOf, security } from "../../../lib/paperTemplates";
import { controllerAccess } from "../../../lib/examController";
import { paperPdf, paperDocx } from "../../../lib/paperExport";

// Paper templates (the Controller) and an official paper's print / download (checked and logged).
// GET ?templates=1 · ?paper=<id>&format=pdf|docx (pdf = print, docx = download) · ?log=<id>
// POST { action: template | deleteTemplate | value (paperId, field, value) }
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("templates")) { const a = await controllerAccess(user as never); if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 }); return NextResponse.json({ templates: await templatesOf(a.chairmanId), mode: a.mode }); }
    if (sp.get("log")) { const s = await security(user as never, String(sp.get("log"))); if (!s.viewer.isSetter && !s.viewer.isHod && !s.viewer.isController) return NextResponse.json({ error: "forbidden" }, { status: 403 }); return NextResponse.json(await logOf(String(sp.get("log")))); }
    const id = String(sp.get("paper") || "");
    const fmt = sp.get("format") === "docx" ? "docx" : "pdf";
    const t = await touch(user as never, id, fmt === "docx" ? "DOWNLOADED" : "PRINTED");
    const { l, qs, name } = await layoutOf(id, t.official ? t.watermark : null);
    if (fmt === "docx") return new NextResponse(await paperDocx(l, qs), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"` } });
    return new NextResponse(Buffer.from(await paperPdf(l, qs)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` } });
  } catch (e) {
    if ((e as { code?: string }).code) throw e;
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status || 400 });
  }
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "template") return NextResponse.json(await saveTemplate(user as never, b));
    if (b.action === "deleteTemplate") return NextResponse.json(await deleteTemplate(user as never, String(b.id || "")));
    if (b.action === "value") return NextResponse.json(await editValue(user as never, String(b.paperId || ""), String(b.field || "").slice(0, 40), String(b.value ?? "")));
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { if ((e as { code?: string }).code) throw e; return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
