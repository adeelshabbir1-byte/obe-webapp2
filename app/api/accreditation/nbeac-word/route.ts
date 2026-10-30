import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { buildDocxResponse } from "../../../../lib/docxExport";
import { sarScope } from "../../../../lib/sarAccess";
import { buildNbeacSar } from "../../../../lib/nbeacSar";
import { nbeacWordDocument } from "../../../../lib/nbeacWord";
import { withErrors } from "../../../../lib/apiHandler";

const BUILDERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
// The NBEAC SAR as a Word document (landscape, for the wide tables).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !BUILDERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = await sarScope(user);
  const deptId = req.nextUrl.searchParams.get("dept") || "";
  if (!scope.departments.some((d) => d.id === deptId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const doc = await buildNbeacSar(user, scope, deptId);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const word = nbeacWordDocument(doc);
  return buildDocxResponse(`NBEAC-SAR-${doc.school.replace(/[^A-Za-z0-9]+/g, "-")}.docx`, word);
}
export const GET = withErrors(GET_handler);
