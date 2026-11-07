import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { withErrors } from "../../../../../../lib/apiHandler";
import { storedStatus } from "../../../../../../lib/facultyStatus";

async function GET_handler() {
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
  const headerRow = ["id", "Login ID", "Faculty Name", "Specialization", "Role", "Highest degree (PhD / MS / BS)", "Designation", "Employment (Permanent / Contract / Visiting / Lab engineer)"];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 22; ws.getColumn(7).width = 22; ws.getColumn(8).width = 26;
  const st = new Map(((await storedStatus(faculty.map((f) => f.id))) || []).map((s) => [s.userId, s]));
  const EMP: Record<string, string> = { PERMANENT: "Permanent", CONTRACT: "Contract", VISITING: "Visiting", LAB_ENGINEER: "Lab engineer" };

  for (const f of faculty) {
    const s = st.get(f.id); ws.addRow([f.id, f.username, f.name, f.specialization || "", f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor", s?.degree || "", s?.designation || "", s?.employment ? EMP[s.employment] || s.employment : ""]);
  }

  // A couple of blank rows at the bottom, ready for new names — and a
  // one-row legend naming exactly which cells to fill in, per this
  // codebase's convention for a sheet someone else is meant to edit.
  const startRow = ws.rowCount + 1;
  for (let i = 0; i < 5; i++) ws.addRow(["", "", "", "", "", "", "", ""]);
  ws.addRow([]);
  const legendRow = ws.addRow(["", "To add new faculty: leave the first column (id) blank, fill in Login ID + Faculty Name, Specialization is optional, Role must be \"Subject Expert\" or \"Course Instructor\" (blank = Course Instructor). Highest degree, Designation and Employment can be filled for anyone, new or existing (a name starting with \"Dr\" is taken as PhD and everyone else as MS when left blank). New logins get the temporary password \"12345678\" and must change it on first login."]);
  legendRow.getCell(2).font = { italic: true, size: 9 };
  ws.mergeCells(legendRow.number, 2, legendRow.number, 8);

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
export const GET = withErrors(GET_handler);
