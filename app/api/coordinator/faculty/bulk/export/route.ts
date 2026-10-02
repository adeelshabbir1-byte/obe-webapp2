import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, managedById: user.id },
    orderBy: { name: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Faculty");

  // Column 1 (id) is a hidden, stable match key for re-upload, same
  // convention as the Primary Instructors / Section Count Matrix exports.
  // A row with an id already belongs to an existing login and is left
  // alone on import — only blank-id rows (added at the bottom) create a
  // new one — so this sheet can't be used to edit an existing faculty
  // member's name/role/specialization by mistake.
  const headerRow = ["id", "Login ID", "Faculty Name", "Specialization", "Role"];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 18;

  for (const f of faculty) {
    ws.addRow([f.id, f.username, f.name, f.specialization || "", f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"]);
  }

  // A couple of blank rows at the bottom, ready for new names — and a
  // one-row legend naming exactly which cells to fill in, per this
  // codebase's convention for a sheet someone else is meant to edit.
  const startRow = ws.rowCount + 1;
  for (let i = 0; i < 5; i++) ws.addRow(["", "", "", "", ""]);
  ws.addRow([]);
  const legendRow = ws.addRow(["", "To add new faculty: leave the first column (id) blank, fill in Login ID + Faculty Name, Specialization is optional, Role must be \"Subject Expert\" or \"Course Instructor\" (blank = Course Instructor). New logins get the temporary password \"12345678\" and must change it on first login."]);
  legendRow.getCell(2).font = { italic: true, size: 9 };
  ws.mergeCells(legendRow.number, 2, legendRow.number, 5);

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Role column: a dropdown limited to the two valid values, so a typo
  // can't silently create a login nobody can account for.
  for (let r = 2; r < startRow + 5; r++) {
    ws.getCell(`E${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Subject Expert,Course Instructor"'],
      showErrorMessage: true, error: 'Must be "Subject Expert" or "Course Instructor"',
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="faculty-list.xlsx"`,
    },
  });
}
