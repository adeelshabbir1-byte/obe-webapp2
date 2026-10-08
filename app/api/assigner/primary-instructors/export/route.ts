import { assignerDept } from "../../../../../lib/assignerScope";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...assignerDept(user) } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, instructor: true },
    orderBy: [{ code: "asc" }],
  });

  const faculty = await prisma.user.findMany({
    where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, canTeach: true },
    orderBy: { name: "asc" },
  });
  // The upload matches faculty by exact NAME, so a name shared by two people
  // can't be assigned from Excel — they're flagged on the Faculty sheet rather
  // than offered as a choice that would be rejected on upload.
  const nameCounts = new Map<string, number>();
  for (const f of faculty) nameCounts.set(f.name, (nameCounts.get(f.name) || 0) + 1);
  const uniqueFaculty = faculty.filter((f) => nameCounts.get(f.name) === 1);
  const duplicateNames = Array.from(new Set(faculty.filter((f) => (nameCounts.get(f.name) || 0) > 1).map((f) => f.name)));

  const workbook = new ExcelJS.Workbook();
  // The assignments sheet MUST stay first — the upload reads the first sheet.
  const ws = workbook.addWorksheet("Primary Instructors");
  const facultySheet = workbook.addWorksheet("Faculty");
  facultySheet.addRow(["Faculty name (pick these in the Current Instructor column)", "Note"]);
  facultySheet.getRow(1).font = { bold: true };
  facultySheet.getColumn(1).width = 52;
  facultySheet.getColumn(2).width = 60;
  for (const f of uniqueFaculty) facultySheet.addRow([f.name, ""]);
  for (const n of duplicateNames) facultySheet.addRow(["", `"${n}" belongs to more than one person — rename one of them in the app before assigning from Excel.`]);

  // Column 1 (id) is a hidden, stable match key for re-upload — same
  // convention as the Section Count Matrix export, so a row survives
  // being filtered, sorted, or reordered in Excel.
  const headerRow = ["id", "Course", "Program/Degree", "Batch", "Current Instructor", "Semester No"];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 22;
  ws.getColumn(5).width = 26;
  ws.getColumn(6).width = 12;

  for (const c of courses) {
    ws.addRow([c.id, `${c.code} — ${c.title}`, c.batch?.degreeProgram || "", c.batch?.batchName || "", c.instructor?.name || "", c.semesterNumber ?? ""]);
  }

  // Dropdown of faculty names on every "Current Instructor" cell — blank is
  // allowed (it clears the assignment), anything not on the list is refused.
  if (uniqueFaculty.length > 0 && courses.length > 0) {
    const listRef = `Faculty!$A$2:$A$${uniqueFaculty.length + 1}`;
    for (let r = 2; r <= courses.length + 1; r++) {
      ws.getCell(r, 5).dataValidation = {
        type: "list", allowBlank: true, formulae: [listRef],
        showErrorMessage: true, errorStyle: "stop", errorTitle: "Not a faculty member",
        error: "Pick a name from the dropdown (see the Faculty sheet), or leave it blank for unassigned.",
      };
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="primary-instructor-assignment.xlsx"`,
    },
  });
}
