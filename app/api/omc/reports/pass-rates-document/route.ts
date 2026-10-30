import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { canViewReports, courseScopeFor } from "../../../../../lib/reportScope";
import { canViewReport } from "../../../../../lib/reportAcl";
import { generatePassRateReport } from "../../../../../lib/passRateReportGenerator";
import { buildDocxResponse } from "../../../../../lib/docxExport";
import { prisma } from "../../../../../lib/db";
import { withErrors } from "../../../../../lib/apiHandler";

async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canViewReport(user, "omc.reports.pass-rates"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const course = await prisma.course.findFirst({ where: { id: courseId, ...courseScopeFor(user) } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const doc = await generatePassRateReport(courseId, user);
    return buildDocxResponse(`${course.code}-CLO-GA-Pass-Rate-Report.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
export const GET = withErrors(GET_handler);
