import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { canViewReports } from "../../../../../../lib/reportScope";
import { getHeatmapReport } from "../../../../../../lib/reports";
import { buildExcelResponse } from "../../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const programs = await getHeatmapReport(user);
  const rows: Record<string, any>[] = [];
  for (const prog of programs) {
    for (const p of prog.plos) {
      const row: Record<string, any> = { program: prog.coordinatorName, plo: `PLO-${p.number}`, title: p.title };
      for (const t of prog.courseTypes) row[t] = prog.matrix[p.number]?.[t] || 0;
      rows.push(row);
    }
  }
  const allTypes = Array.from(new Set(programs.flatMap((p) => p.courseTypes)));

  return buildExcelResponse("plo-depth-heatmap.xlsx", [{
    name: "PLO Depth Heatmap",
    columns: [
      { header: "Program", key: "program", width: 22 },
      { header: "PLO", key: "plo", width: 10 },
      { header: "Title", key: "title", width: 34 },
      ...allTypes.map((t) => ({ header: t, key: t, width: 14 })),
    ],
    rows,
  }]);
}
