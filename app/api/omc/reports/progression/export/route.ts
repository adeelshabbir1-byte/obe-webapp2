import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { getProgressionReport } from "../../../../../../lib/reports";
import { buildExcelResponse } from "../../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const programs = await getProgressionReport(user.managedById);
  const rows: Record<string, any>[] = [];
  for (const prog of programs) {
    for (const p of prog.plos) {
      const row: Record<string, any> = { program: prog.coordinatorName, plo: `PLO-${p.number}`, title: p.title };
      for (const s of prog.semesters) row[`Sem ${s}`] = prog.matrix[p.number]?.[s] || 0;
      rows.push(row);
    }
  }

  return buildExcelResponse("plo-semester-progression.xlsx", [{
    name: "Semester Progression",
    columns: [
      { header: "Program", key: "program", width: 22 },
      { header: "PLO", key: "plo", width: 10 },
      { header: "Title", key: "title", width: 34 },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ header: `Sem ${s}`, key: `Sem ${s}`, width: 10 })),
    ],
    rows,
  }]);
}
