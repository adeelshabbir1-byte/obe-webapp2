import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { getGradingScaleForBatch } from "../../../../../../lib/gradingScaleLookup";
import { writeAuditLog } from "../../../../../../lib/audit";

// Adds one historical grade directly to a student's transcript — for a
// single correction or one-off backfill (the bulk-upload page is for a
// whole batch at once). Same destination as the live closeout snapshot
// (StudentTranscriptRecord), so it shows up everywhere the transcript
// already reads from — no separate code path downstream.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["PROGRAM_COORDINATOR", "CHAIRMAN", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || !student.batch) return NextResponse.json({ error: "student not found" }, { status: 404 });
  if (user.role === "PROGRAM_COORDINATOR" && student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not your student" }, { status: 403 });

  const body = await req.json();
  const courseCode = String(body.courseCode || "").trim();
  const courseTitle = String(body.courseTitle || "").trim();
  const creditHours = parseInt(body.creditHours, 10);
  const grade = String(body.grade || "").trim().toUpperCase();
  const termName = String(body.termName || "").trim();
  const termYear = parseInt(body.termYear, 10);
  if (!courseCode || !courseTitle || !Number.isFinite(creditHours) || creditHours <= 0 || !grade || !termName || !Number.isFinite(termYear)) {
    return NextResponse.json({ error: "course code, title, credit hours, grade, term name and term year are all required" }, { status: 400 });
  }

  const gradingScale = await getGradingScaleForBatch(student.batch.coordinatorId, student.batch);
  const gpaPoints = grade === "W" ? null : gradingScale.find((g) => g.letter.toUpperCase() === grade)?.gpaValue ?? null;

  const record = await prisma.studentTranscriptRecord.create({
    data: {
      studentId: student.id, coordinatorId: student.batch.coordinatorId,
      courseCode, courseTitle, creditHours, courseType: "Core",
      termName, termYear, totalPct: 0, grade, gpaPoints,
      cloAttainmentJson: "[]", ploAttainmentJson: "[]",
    },
  });

  await writeAuditLog({
    actorUserId: user.id, action: "HISTORICAL_GRADE_ADDED", entityType: "Student", entityId: student.id,
    metadata: { courseCode, grade, termName, termYear },
  });

  return NextResponse.json({ ok: true, record: { id: record.id } });
}
