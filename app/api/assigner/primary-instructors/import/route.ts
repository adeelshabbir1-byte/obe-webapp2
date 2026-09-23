import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const instructors = await prisma.user.findMany({ where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } });

  // Exact-name matching, same rigor as the Section Count Matrix import —
  // a name that isn't unique among this chairman's faculty is skipped
  // rather than guessed at, and reported back rather than silently ignored.
  const nameCounts = new Map<string, number>();
  for (const i of instructors) nameCounts.set(i.name, (nameCounts.get(i.name) || 0) + 1);
  const instructorByName = new Map(instructors.filter((i) => nameCounts.get(i.name) === 1).map((i) => [i.name, i.id]));
  const ambiguousNames = new Set(instructors.filter((i) => nameCounts.get(i.name)! > 1).map((i) => i.name));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.worksheets[0];
  if (!ws) return NextResponse.json({ error: "The uploaded file has no worksheet." }, { status: 400 });

  // Only this chairman's own offered courses can be written to — a row
  // from someone else's export, or a hand-edited id, can't touch data
  // it doesn't belong to.
  const validCourses = await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true }, select: { id: true, instructorId: true } });
  const validCourseIds = new Map(validCourses.map((c) => [c.id, c.instructorId]));

  let updated = 0, unchanged = 0, cleared = 0, rowsSkipped = 0;
  const skippedRowIds: string[] = [];
  const unrecognizedNames = new Set<string>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawId = row.getCell(1).value;
    if (!rawId) continue;
    const id = String(rawId);

    if (!validCourseIds.has(id)) { rowsSkipped++; skippedRowIds.push(id); continue; }

    const rawName = row.getCell(5).value; // column E: "Current Instructor"
    const name = rawName ? String(rawName).trim() : "";

    let newInstructorId: string | null = null;
    if (name) {
      const matchedId = instructorByName.get(name);
      if (!matchedId) {
        if (ambiguousNames.has(name)) unrecognizedNames.add(`${name} (matches more than one person)`);
        else unrecognizedNames.add(name);
        rowsSkipped++; skippedRowIds.push(id);
        continue;
      }
      newInstructorId = matchedId;
    }

    const currentInstructorId = validCourseIds.get(id) || null;
    if (newInstructorId === currentInstructorId) { unchanged++; continue; }

    await prisma.course.update({ where: { id }, data: { instructorId: newInstructorId } });
    await writeAuditLog({
      actorUserId: user.id, action: "INSTRUCTOR_ASSIGNED", entityType: "Course", entityId: id,
      metadata: { instructorId: newInstructorId || "none", via: "excel_import" },
    });
    if (newInstructorId) updated++; else cleared++;
  }

  return NextResponse.json({
    ok: true, updated, cleared, unchanged, rowsSkipped, skippedRowIds: skippedRowIds.slice(0, 20),
    unrecognizedNames: Array.from(unrecognizedNames).slice(0, 20),
  });
}
