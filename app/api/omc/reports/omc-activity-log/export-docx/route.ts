import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { canViewReports } from "../../../../../../lib/reportScope";
import { canViewReport } from "../../../../../../lib/reportAcl";
import { generateOmcMinutes } from "../../../../../../lib/omcMinutesGenerator";
import { buildDocxResponse } from "../../../../../../lib/docxExport";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canViewReport(user, "omc.reports.omc-activity-log"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const degreeProgram = searchParams.get("degreeProgram") || undefined;
  const termName = searchParams.get("termName") || undefined;
  const termYear = searchParams.get("termYear") ? parseInt(searchParams.get("termYear")!, 10) : undefined;
  const term = degreeProgram && termName && termYear ? { degreeProgram, termName, termYear } : undefined;

  try {
    const doc = await generateOmcMinutes(user, {
      omcId: searchParams.get("omcId") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    }, term);
    const filenameTerm = term ? `${term.degreeProgram}-${term.termName}-${term.termYear}`.replace(/\s+/g, "-") : "all";
    return buildDocxResponse(`OMC-Minutes-of-Meeting-${filenameTerm}.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
