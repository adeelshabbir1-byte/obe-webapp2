import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getCoverageReport } from "../../../../../lib/reports";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const programs = await getCoverageReport(user.managedById);
  const rows: Record<string, any>[] = [];
  for (const p of programs) {
    for (const r of p.rows) {
      rows.push({
        program: p.coordinatorName, plo: `PLO-${r.number}`, title: r.title, status: r.status,
        coursesMapped: r.count, byType: Object.entries(r.byType).map(([t, n]) => `${t}: ${n}`).join(", "),
      });
    }
  }

  return buildExcelResponse("plo-coverage-summary.xlsx", [{
    name: "PLO Coverage Summary",
    columns: [
      { header: "Program", key: "program", width: 24 },
      { header: "PLO", key: "plo", width: 10 },
      { header: "Title", key: "title", width: 40 },
      { header: "Status", key: "status", width: 16 },
      { header: "Courses Mapped", key: "coursesMapped", width: 16 },
      { header: "By Course Type", key: "byType", width: 40 },
    ],
    rows,
  }]);
}
