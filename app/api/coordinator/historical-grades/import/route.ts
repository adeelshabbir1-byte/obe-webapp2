import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { getGradingScaleForBatch } from "../../../../../lib/gradingScaleLookup";
import { writeAuditLog } from "../../../../../lib/audit";

// Backfills StudentTranscriptRecord rows for a batch that completed some or
// all of its semesters before this system was in use — the only other way
// those records exist is via a live course closeout, which never happened
// for old terms. No CLO/PLO attainment data exists for a backfilled term
// (no instrument-level marks were ever entered), so those fields are just
// empty arrays — the record still counts fully toward GPA/CGPA and the
// Courses Remaining list, just not toward Transcript 2's CLO/PLO stats.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["PROGRAM_COORDINATOR", "CHAIRMAN", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const batchId = String(body?.batchId || "");
  const dataRows: { rollNumber: string; courseCode: string; courseTitle: string; creditHours: string; grade: string; termName: string; termYear: string }[] = Array.isArray(body?.rows) ? body.rows : [];
  const rowOffset: number = typeof body?.rowOffset === "number" ? body.rowOffset : 0;
  if (!batchId || dataRows.length === 0) return NextResponse.json({ error: "batchId and rows are required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });
  if (user.role === "PROGRAM_COORDINATOR" && batch.coordinatorId !== user.id) return NextResponse.json({ error: "not your batch" }, { status: 403 });

  const gradingScale = await getGradingScaleForBatch(batch.coordinatorId, batch);
  const gpaByLetter = new Map(gradingScale.map((g) => [g.letter.toUpperCase(), g.gpaValue]));

  const students = await prisma.student.findMany({ where: { batchId } });
  const byRoll = new Map(students.map((s) => [s.rollNumber.trim().toLowerCase(), s]));

  let imported = 0;
  const rowErrors: { row: number; rollNumber: string; courseCode: string; reason: string }[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const student = byRoll.get(r.rollNumber.trim().toLowerCase());
    if (!student) {
      rowErrors.push({ row: rowOffset + i + 1, rollNumber: r.rollNumber, courseCode: r.courseCode, reason: `no student with roll number "${r.rollNumber}" in this batch` });
      continue;
    }
    const creditHours = parseInt(r.creditHours, 10);
    const termYear = parseInt(r.termYear, 10);
    if (!Number.isFinite(creditHours) || creditHours <= 0 || !Number.isFinite(termYear)) {
      rowErrors.push({ row: rowOffset + i + 1, rollNumber: r.rollNumber, courseCode: r.courseCode, reason: "credit hours or term year isn't a valid number" });
      continue;
    }
    const grade = r.grade.trim().toUpperCase();
    const gpaPoints = grade === "W" ? null : gpaByLetter.get(grade) ?? null;

    // Skip an exact duplicate of a record already on file, so re-running
    // the same file (e.g. after fixing a few rows) doesn't double up
    // everything that already imported fine the first time.
    const existing = await prisma.studentTranscriptRecord.findFirst({
      where: { studentId: student.id, courseCode: r.courseCode, termName: r.termName, termYear, grade },
    });
    if (existing) continue;

    try {
      await prisma.studentTranscriptRecord.create({
        data: {
          studentId: student.id, coordinatorId: batch.coordinatorId,
          courseCode: r.courseCode, courseTitle: r.courseTitle, creditHours, courseType: "Core",
          termName: r.termName, termYear, totalPct: 0, grade, gpaPoints,
          cloAttainmentJson: "[]", ploAttainmentJson: "[]",
        },
      });
      imported++;
    } catch {
      rowErrors.push({ row: rowOffset + i + 1, rollNumber: r.rollNumber, courseCode: r.courseCode, reason: "couldn't save this row (unexpected database error)" });
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: "HISTORICAL_GRADES_IMPORTED",
    metadata: { batchId, imported, rowErrors: rowErrors.length, chunkSize: dataRows.length },
  });

  return NextResponse.json({ imported, rowErrors });
}
