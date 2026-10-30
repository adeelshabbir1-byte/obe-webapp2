import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { buildExcelResponse } from "../../../../../lib/excelExport";
import { buildDocxResponse } from "../../../../../lib/docxExport";
import { loadCurriculumForDownload, curriculumSheets, curriculumDocument, fileBase } from "../../../../../lib/masterCurriculumDownload";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 120;

// The full master curriculum: ?format=xlsx (default) or ?format=docx.
async function GET_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const c = await loadCurriculumForDownload(user, params.id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (req.nextUrl.searchParams.get("format") === "docx") return buildDocxResponse(`${fileBase(c)}.docx`, curriculumDocument(c));
  return buildExcelResponse(`${fileBase(c)}.xlsx`, curriculumSheets(c));
}
export const GET = withErrors(GET_handler);
