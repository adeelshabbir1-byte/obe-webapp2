import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// currentSemesterNumber previously had no way to ever change at all —
// every student stayed at its default of 1 forever, with nothing in
// the app advancing it. This is the missing piece: a Coordinator-
// triggered bulk action, once per term, that advances every student
// in a batch by one semester except whichever ones are explicitly
// held back (repeating a semester, or otherwise not progressing on
// schedule this term). Deliberately uncapped at 8 — a student well
// past their batch's normal final semester, still working through a
// retake or a GPA-improvement repeat, keeps advancing in real term
// count even though no course template goes past semesterNumber 8;
// that's fine, since default batch-wide enrollment simply finds
// nothing to auto-enroll them in at that point (correct — they need
// deliberate registration for the specific earlier-semester course
// they're retaking, not a blanket default), while manual
// register/withdraw and out-of-batch requests were already
// independent of this field entirely.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const batchId = String(body.batchId || "");
  const heldBackIds: string[] = Array.isArray(body.heldBackStudentIds) ? body.heldBackStudentIds : [];

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const students = await prisma.student.findMany({ where: { batchId } });
  const heldBackSet = new Set(heldBackIds);
  const toAdvance = students.filter((s) => !heldBackSet.has(s.id));

  if (toAdvance.length > 0) {
    await prisma.$transaction(
      toAdvance.map((s) => prisma.student.update({ where: { id: s.id }, data: { currentSemesterNumber: s.currentSemesterNumber + 1 } }))
    );
  }

  await writeAuditLog({
    actorUserId: user.id, action: "STUDENTS_SEMESTER_ADVANCED", entityType: "Batch", entityId: batch.id,
    metadata: { advanced: toAdvance.length, heldBack: heldBackSet.size },
  });

  return NextResponse.json({ advanced: toAdvance.length, heldBack: heldBackSet.size });
}
