import { canViewReport } from "../../../../../../lib/reportAcl";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { canViewReports } from "../../../../../../lib/reportScope";
import { getOmcActivityLog } from "../../../../../../lib/reports";
import { formatActionLabel, formatMetadata } from "../../../../../../lib/auditLabels";
import { buildExcelResponse } from "../../../../../../lib/excelExport";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canViewReport(user, "omc.reports.omc-activity-log"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  // Excel export ignores pagination — the whole filtered log, one sheet,
  // so it's a real record to hand an accreditation panel rather than
  // just whatever page happened to be on screen.
  const allRows: Record<string, any>[] = [];
  let page = 1;
  while (true) {
    const { rows, total, pageSize } = await getOmcActivityLog(user, {
      omcId: searchParams.get("omcId") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      page,
    });
    for (const r of rows) {
      allRows.push({
        when: r.createdAt.toISOString().replace("T", " ").slice(0, 16),
        member: r.actorName,
        action: formatActionLabel(r.action),
        on: r.entityLabel,
        details: formatMetadata(r.metadata),
      });
    }
    if (page * pageSize >= total) break;
    page++;
    if (page > 200) break; // sane upper bound
  }

  return buildExcelResponse("omc-activity-log.xlsx", [{
    name: "OMC Activity Log",
    columns: [
      { header: "When", key: "when", width: 18 },
      { header: "OMC Member", key: "member", width: 22 },
      { header: "Action", key: "action", width: 28 },
      { header: "On", key: "on", width: 36 },
      { header: "Details", key: "details", width: 40 },
    ],
    rows: allRows,
  }]);
}
