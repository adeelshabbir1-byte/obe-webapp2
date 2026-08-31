import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getBloomReport, BLOOM_ORDER } from "../../../../../lib/reports";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const programs = await getBloomReport(user.managedById);
  const overallRows: Record<string, any>[] = [];
  const semesterRows: Record<string, any>[] = [];

  for (const prog of programs) {
    const row: Record<string, any> = { program: prog.coordinatorName, totalClos: prog.totalClos, higherOrderPct: `${prog.higherOrderPct}%` };
    for (const b of BLOOM_ORDER) row[b] = prog.overall[b] || 0;
    overallRows.push(row);

    for (const [sem, counts] of Object.entries(prog.bySemester)) {
      if (Number(sem) === 0) continue;
      const r: Record<string, any> = { program: prog.coordinatorName, semester: `Sem ${sem}` };
      for (const b of BLOOM_ORDER) r[b] = (counts as any)[b] || 0;
      semesterRows.push(r);
    }
  }

  return buildExcelResponse("clo-bloom-distribution.xlsx", [
    {
      name: "Overall Distribution",
      columns: [
        { header: "Program", key: "program", width: 22 },
        { header: "Total CLOs", key: "totalClos", width: 12 },
        { header: "Higher-Order %", key: "higherOrderPct", width: 16 },
        ...BLOOM_ORDER.map((b) => ({ header: b, key: b, width: 8 })),
      ],
      rows: overallRows,
    },
    {
      name: "By Semester",
      columns: [
        { header: "Program", key: "program", width: 22 },
        { header: "Semester", key: "semester", width: 12 },
        ...BLOOM_ORDER.map((b) => ({ header: b, key: b, width: 8 })),
      ],
      rows: semesterRows,
    },
  ]);
}
