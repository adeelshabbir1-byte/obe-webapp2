import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, instructor: true },
    orderBy: [{ code: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Primary Instructors");

  // Column 1 (id) is a hidden, stable match key for re-upload — same
  // convention as the Section Count Matrix export, so a row survives
  // being filtered, sorted, or reordered in Excel.
  const headerRow = ["id", "Course", "Program/Degree", "Batch", "Current Instructor"];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 22;
  ws.getColumn(5).width = 26;

  for (const c of courses) {
    ws.addRow([c.id, `${c.code} — ${c.title}`, c.batch?.degreeProgram || "", c.batch?.batchName || "", c.instructor?.name || ""]);
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
