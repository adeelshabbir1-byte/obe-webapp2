import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { threeWay } from "../../../../lib/threeWay";

// The three-way comparison as an Excel file.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t = await threeWay(req.nextUrl.searchParams.get("batchId") || "");
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comparison");
  ws.addRow([`${t.batch.degreeProgram} — ${t.batch.batchName}`, "", "", "", t.ref ? `${t.ref.authority} ${t.ref.title}` : "No council curriculum", "", "", "", t.prevBatch ? t.prevBatch.batchName : "No previous batch"]);
  ws.addRow(["Code", "Title", "CH", "Sem", "Code", "Title", "CH", "Sem", "Code", "Title", "CH", "Sem", "Status"]);
  [1, 2].forEach((r) => (ws.getRow(r).font = { bold: true }));
  const c = (x: { code: string; title: string; ch: number; sem: number | null } | null) => (x ? [x.code, x.title, x.ch, x.sem ?? ""] : ["", "", "", ""]);
  for (const r of t.rows) ws.addRow([...c(r.batch), ...c(r.council), ...c(r.prev), r.status]);
  ws.addRow(["Total", "", t.totals.batch, "", "Total", "", t.totals.council, "", "Total", "", t.totals.prev]).font = { bold: true };
  [10, 34, 6, 6, 10, 34, 6, 6, 10, 34, 6, 6, 30].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 2 }];
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="comparison-${t.batch.batchName.replace(/\W+/g, "-")}.xlsx"` } });
}
