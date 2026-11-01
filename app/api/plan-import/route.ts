import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { templateWorkbook, previewImport, applyImport, applyPending, undoImport, importsOf, saveMapping } from "../../../lib/planWorkbook";
import type { Mapping, PartKey } from "../../../lib/planWorkbookCore";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;

// Excel course-plan import. GET ?template=1 — the blank workbook · ?courseId=&source= — this plan's imports.
// POST (form): action = preview | apply | applyPending | undo | mapping; courseId, source (SE | INSTRUCTOR), file,
// parts ("clos,lectures,…"), mapping (JSON: the columns the person pointed to; remembered per institute).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("template")) return new NextResponse(await templateWorkbook(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="course-plan-template.xlsx"' } });
  return NextResponse.json({ imports: await importsOf(String(sp.get("courseId") || ""), sp.get("source") === "INSTRUCTOR" ? "INSTRUCTOR" : "SE") });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  if (!f) return NextResponse.json({ error: "Send the form." }, { status: 400 });
  const action = String(f.get("action") || "preview");
  const courseId = String(f.get("courseId") || ""), source = f.get("source") === "INSTRUCTOR" ? "INSTRUCTOR" : "SE";
  let mapping: Mapping = {};
  try { mapping = JSON.parse(String(f.get("mapping") || "{}")); } catch { mapping = {}; }
  try {
    if (action === "undo") return NextResponse.json(await undoImport(user, String(f.get("importId") || "")));
    if (action === "applyPending") return NextResponse.json(await applyPending(user, req, String(f.get("importId") || "")));
    if (action === "mapping") return NextResponse.json({ mapping: await saveMapping(await chairmanIdFor(user), mapping, user.id) });
    const file = f.get("file") as File | null;
    if (!file || !file.size) return NextResponse.json({ error: "Choose the Excel file." }, { status: 400 });
    if (Object.keys(mapping).length) await saveMapping(await chairmanIdFor(user), mapping, user.id);
    if (action === "apply") {
      const parts = String(f.get("parts") || "").split(",").filter(Boolean) as PartKey[];
      const r = await applyImport(user, req, courseId, source, file, parts, mapping);
      return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
    }
    const pv = await previewImport(user, courseId, source, file, mapping);
    return NextResponse.json({ ...pv, parsed: undefined });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
