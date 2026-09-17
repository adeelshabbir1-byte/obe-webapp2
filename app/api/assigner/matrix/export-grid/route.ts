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
      include: { members: { where: { course: { isOffered: true } }, include: { course: true } }, sectionAssignments: true },
    }),
    prisma.user.findMany({ where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, orderBy: { name: "asc" } }),
  ]);

  // Same course-row shape and type-grouped ordering as the on-screen matrix.
  const standaloneCourses = courses.filter((c) => !groups.some((g) => g.members.some((m) => m.courseId === c.id)));
  let rows = [
    ...standaloneCourses.map((c) => ({
      label: `${c.code} — ${c.title}`, courseType: c.courseType,
      assignments: Object.fromEntries(c.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
    })),
    ...groups.map((g) => ({
      label: `${g.name} (Combined)`, courseType: "Combined",
      assignments: Object.fromEntries(g.sectionAssignments.map((a) => [a.instructorId, a.sectionCount])),
    })),
  ];
  rows = rows.sort((a, b) => typeRank(a.courseType) - typeRank(b.courseType) || a.label.localeCompare(b.label));

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Section Matrix");

  const headerRow = ["Course", ...instructors.map((i) => i.name)];
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 42;
  instructors.forEach((_, idx) => { ws.getColumn(idx + 2).width = 16; });

  for (const r of rows) {
    const rowValues = [r.label, ...instructors.map((i) => r.assignments[i.id] || "")];
    ws.addRow(rowValues);
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="section-assignment-grid.xlsx"`,
    },
  });
}
