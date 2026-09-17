import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const instructors = await prisma.user.findMany({ where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } });
  // Exact-name matching, same rigor as the earlier allocation import —
  // a name that isn't unique among this chairman's faculty is skipped
  // rather than guessed at.
  const nameCounts = new Map<string, number>();
  for (const i of instructors) nameCounts.set(i.name, (nameCounts.get(i.name) || 0) + 1);
  const instructorByName = new Map(instructors.filter((i) => nameCounts.get(i.name) === 1).map((i) => [i.name, i.id]));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.worksheets[0];
  if (!ws) return NextResponse.json({ error: "The uploaded file has no worksheet." }, { status: 400 });

  const headerRow = ws.getRow(1).values as any[];
  // Column indices from exceljs are 1-based and the array's index 0 is
  // unused, so headerRow[1] is column A ("id").
  const instructorColumns: { col: number; instructorId: string }[] = [];
  const skippedInstructorNames: string[] = [];
  for (let col = 7; col <= (headerRow.length - 1); col++) {
    const name = headerRow[col];
    if (!name) continue;
    const id = instructorByName.get(String(name));
    if (id) instructorColumns.push({ col, instructorId: id });
    else skippedInstructorNames.push(String(name));
  }

  let coursesUpdated = 0, groupsUpdated = 0, rowsSkipped = 0;
  const skippedRowIds: string[] = [];

  // Validate every id up front against this chairman's own courses/groups,
  // so a row from someone else's export (or a hand-edited id) can't write
  // into data it doesn't belong to.
  const validCourseIds = new Set((await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds } }, select: { id: true } })).map((c) => c.id));
  const validGroupIds = new Set((await prisma.courseEquivalenceGroup.findMany({ where: { chairmanId: user.managedById || "" }, select: { id: true } })).map((g) => g.id));

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawId = row.getCell(1).value;
    if (!rawId) continue;
    const id = String(rawId);

    if (id.startsWith("group:")) {
      const groupId = id.slice("group:".length);
      if (!validGroupIds.has(groupId)) { rowsSkipped++; skippedRowIds.push(id); continue; }
      for (const { col, instructorId } of instructorColumns) {
        const raw = row.getCell(col).value;
        const n = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
        if (!n || n <= 0) {
          await prisma.groupSectionAssignment.deleteMany({ where: { groupId, instructorId } });
        } else {
          await prisma.groupSectionAssignment.upsert({
            where: { groupId_instructorId: { groupId, instructorId } },
            create: { groupId, instructorId, sectionCount: n },
            update: { sectionCount: n },
          });
        }
      }
      groupsUpdated++;
    } else {
      if (!validCourseIds.has(id)) { rowsSkipped++; skippedRowIds.push(id); continue; }
      for (const { col, instructorId } of instructorColumns) {
        const raw = row.getCell(col).value;
        const n = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
        if (!n || n <= 0) {
          await prisma.courseSectionAssignment.deleteMany({ where: { courseId: id, instructorId } });
        } else {
          await prisma.courseSectionAssignment.upsert({
            where: { courseId_instructorId: { courseId: id, instructorId } },
            create: { courseId: id, instructorId, sectionCount: n },
            update: { sectionCount: n },
          });
        }
      }
      coursesUpdated++;
    }
  }

  return NextResponse.json({
    ok: true, coursesUpdated, groupsUpdated, rowsSkipped, skippedRowIds: skippedRowIds.slice(0, 20),
    skippedInstructorNames,
  });
}
