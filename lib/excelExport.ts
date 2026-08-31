import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export type SheetSpec = {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, any>[];
};

/**
 * Builds a multi-sheet .xlsx workbook and returns it as a downloadable
 * NextResponse. Used by every report's /export route so formatting (bold
 * headers, frozen header row, auto width) stays consistent across reports.
 */
export async function buildExcelResponse(filename: string, sheets: SheetSpec[]): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OBE Curriculum Governance";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31)); // Excel sheet name limit
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEADC" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of sheet.rows) ws.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
