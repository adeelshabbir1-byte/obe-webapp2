import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { canViewReports } from "../../../../../lib/reportScope";
import { canViewReport } from "../../../../../lib/reportAcl";
import { generatePassRateReport } from "../../../../../lib/passRateReportGenerator";
import { buildDocxResponse } from "../../../../../lib/docxExport";
import { prisma } from "../../../../../lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canViewReport(user, "omc.reports.pass-rates"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const doc = await generatePassRateReport(courseId, user);
    return buildDocxResponse(`${course.code}-CLO-PLO-Pass-Rate-Report.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
