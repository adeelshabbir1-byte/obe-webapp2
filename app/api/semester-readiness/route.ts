import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { rgb } from "pdf-lib";
import { getAuthenticatedUser } from "../../../lib/session";
import { readinessBoard, BOARD_ROLES } from "../../../lib/semesterReadiness";
import { COLUMNS } from "../../../lib/semesterReadinessCore";
import { PdfDoc } from "../../../lib/pdfDoc";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;

// GET ?format=xlsx|pdf — the semester readiness board for meetings (programs and their batches, each cell's count).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !BOARD_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { programs, line } = await readinessBoard(user);
  const rows = programs.flatMap((p) => [[p.program, p.term, ...COLUMNS.map((c) => p.cells[c.key].text), p.start ? p.start.toISOString().slice(0, 10) : "", p.ready ? "Ready" : "Not ready"], ...p.batches.map((b) => [`   ${b.label}`, "", ...COLUMNS.map((c) => b.cells[c.key].text), "", b.ready ? "Ready" : "Not ready"])]);
  const head = ["Program / batch", "Term", ...COLUMNS.map((c) => c.label), "Starts", "Status"];
  if (req.nextUrl.searchParams.get("format") === "pdf") {
    const pdf = await PdfDoc.create("Semester readiness");
    pdf.title("Semester readiness", line);
    const cellsOf = programs.flatMap((p) => [p.cells, ...p.batches.map((b) => b.cells)]);
    pdf.table(head.map((h, i) => [h, i === 0 ? 150 : i === 1 ? 50 : 52] as [string, number]), rows, { size: 7.5, colour: (r, c) => { const k = COLUMNS[c - 2]?.key; const l = k ? cellsOf[r]?.[k]?.light : undefined; return l === "red" ? rgb(0.7, 0.15, 0.12) : l === "amber" ? rgb(0.6, 0.4, 0.05) : undefined; } });
    return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="semester-readiness.pdf"' } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Readiness");
  ws.addRow([line]).font = { bold: true };
  ws.addRow([]);
  ws.addRow(head).font = { bold: true };
  const cellsOf = programs.flatMap((p) => [p.cells, ...p.batches.map((b) => b.cells)]);
  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    COLUMNS.forEach((c, j) => { const l = cellsOf[i][c.key].light; row.getCell(j + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: l === "green" ? "FFDCEFDF" : l === "amber" ? "FFFBF0D2" : "FFF8D7D4" } }; });
    if (!String(r[0]).startsWith(" ")) row.font = { bold: true };
  });
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 44 : 16; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="semester-readiness.xlsx"' } });
}
export const GET = withErrors(GET_handler);
