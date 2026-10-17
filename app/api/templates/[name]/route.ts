import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { TEMPLATES } from "../../../../lib/importTemplates";

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** GET — the download format for an upload: its columns, an example row and instructions. */
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t = TEMPLATES[params.name];
  if (!t) return NextResponse.json({ error: "unknown format" }, { status: 404 });
  const disp = `attachment; filename="${t.file}"`;
  if (t.csv) {
    const s = t.sheets[0];
    const body = [s.headers, ...s.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disp } });
  }
  const wb = new ExcelJS.Workbook();
  for (const s of t.sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.headers).font = { bold: true };
    for (const r of s.rows) ws.addRow(r);
    s.headers.forEach((_, i) => { ws.getColumn(i + 1).width = s.widths?.[i] || 18; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 110;
  info.addRow([t.title]).font = { bold: true, size: 13 };
  info.addRow(["Replace the example row(s) with your own data. Keep the column headings as they are."]);
  for (const n of t.notes) info.addRow([n]);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": disp } });
}
