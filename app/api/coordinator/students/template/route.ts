import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// GET: Excel template for the multi-batch student upload (A Name, B Roll Number, C Batch Name from a drop-down, D Track).
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: { batchName: "asc" }, select: { batchName: true } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.columns = [{ header: "Name", width: 28 }, { header: "Roll Number", width: 18 }, { header: "Batch Name", width: 22 }, { header: "Track", width: 18 }];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEADC" } };
  const lists = wb.addWorksheet("Lists");
  batches.forEach((b, i) => { lists.getCell(i + 1, 1).value = b.batchName; });
  ["Non-Medical", "Pre-Medical"].forEach((t, i) => { lists.getCell(i + 1, 2).value = t; });
  for (let r = 2; r <= 2000; r++) {
    if (batches.length) ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: false, formulae: [`Lists!$A$1:$A$${batches.length}`] };
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$B$1:$B$2"] };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("How to fill");
  ["Required: Name, Roll Number, Batch Name (pick from the drop-down). Track is optional.",
    "Other details (email, phone, CNIC, father's name …) the student completes in their own profile.",
    "A student already in the batch (same roll number) is updated, not duplicated.",
    "Each student's first password is their roll number; they must change it at first sign-in."].forEach((t, i) => { help.getCell(i + 1, 1).value = t; });
  help.getColumn(1).width = 100;
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="students_template.xlsx"' } });
}
