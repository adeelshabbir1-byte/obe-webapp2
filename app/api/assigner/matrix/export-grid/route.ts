import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

const TYPE_ORDER = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience", "Certification", "Combined"];
function typeRank(t: string): number {
  const i = TYPE_ORDER.indexOf(t);
  return i === -1 ? TYPE_ORDER.length : i;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, groups, instructors] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
      include: { batch: true, sectionAssignments: true },
    }),
    prisma.courseEquivalenceGroup.findMany({
      where: { chairmanId: user.managedById || "", members: { some: { course: { isOffered: true } } } },
      include: { members: { where: { course: { isOffered: true } }, include: { course: { include: { batch: true } } } }, sectionAssignments: true },
    }),
    prisma.user.findMany({ where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, orderBy: { name: "asc" } }),
  ]);

  const standaloneCourses = courses.filter((c) => !groups.some((g) => g.members.some((m) => m.courseId === c.id)));
  let rows = [
    ...standaloneCourses.map((c) => ({
      id: c.id, label: `${c.code} — ${c.title}`, degreeProgram: c.batch?.degreeProgram || "", batchName: c.batch?.batchName || "",
      courseType: c.courseType, semesterNumber: c.semesterNumber ?? "",
      assignments: Object.fromEntries(c.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
    })),
    ...groups.map((g) => ({
      id: `group:${g.id}`, label: `${g.name} (Combined)`,
      degreeProgram: g.members.map((m) => m.course.batch?.degreeProgram).filter(Boolean).join("; "),
      batchName: g.members.map((m) => m.course.batch?.batchName).filter(Boolean).join("; "),
      courseType: "Combined", semesterNumber: "",
      assignments: Object.fromEntries(g.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
    })),
  ];
  rows = rows.sort((a, b) => typeRank(a.courseType) - typeRank(b.courseType) || a.label.localeCompare(b.label));

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Section Matrix");

  // Column 1 (id) is the stable identifier used to match rows back on
  // re-upload — it survives being filtered, hidden, sorted, or reordered
  // in Excel, none of which the app can otherwise detect happened.
  const headerRow = ["id", "Course", "Program/Degree", "Batch", "Type", "Semester No", ...instructors.map((i) => i.name)];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 22;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 12;
  instructors.forEach((_, idx) => { ws.getColumn(idx + 7).width = 16; });

  for (const r of rows) {
    ws.addRow([r.id, r.label, r.degreeProgram, r.batchName, r.courseType, r.semesterNumber, ...instructors.map((i) => r.assignments[i.id] || "")]);
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
  ws.views = [{ state: "frozen", xSplit: 6, ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="section-assignment-grid.xlsx"`,
    },
  });
}
