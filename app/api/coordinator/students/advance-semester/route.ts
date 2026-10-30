import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

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
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const batchId = String(body.batchId || "");
  const heldBackIds: string[] = Array.isArray(body.heldBackStudentIds) ? body.heldBackStudentIds : [];

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  // A double-click or retry must not push the batch two semesters.
  const recent = await prisma.auditLog.findFirst({ where: { action: "STUDENTS_SEMESTER_ADVANCED", entityId: batch.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) return NextResponse.json({ error: "This batch was just advanced. Wait a minute before advancing it again." }, { status: 409 });

  const students = await prisma.student.findMany({ where: { batchId } });
  const heldBackSet = new Set(heldBackIds);
  const toAdvance = students.filter((s) => !heldBackSet.has(s.id));

  // Never past the batch's calendar semester (the term change already moves students there on its own).
  const ct = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });
  const { computeCurrentSemesterNumber } = await import("../../../../../lib/termLogic");
  const cap = ct ? computeCurrentSemesterNumber(batch, ct) : Infinity;
  const movable = toAdvance.filter((s) => s.currentSemesterNumber < cap);
  if (movable.length > 0) {
    await prisma.$transaction(
      movable.map((s) => prisma.student.update({ where: { id: s.id }, data: { currentSemesterNumber: { increment: 1 } } }))
    );
  }

  // Held back is remembered, so the automatic calendar sync keeps them behind (one more semester each time).
  const { holdBacks, setHoldBack } = await import("../../../../../lib/semesterSync");
  const prior = await holdBacks(Array.from(heldBackSet));
  for (const id of Array.from(heldBackSet)) if (students.some((s) => s.id === id)) await setHoldBack(id, (prior.get(id)?.lag || 0) + 1, typeof body.reason === "string" ? body.reason.slice(0, 300) : null, user.id).catch(() => {});

  await writeAuditLog({
    actorUserId: user.id, action: "STUDENTS_SEMESTER_ADVANCED", entityType: "Batch", entityId: batch.id,
    metadata: { advanced: toAdvance.length, heldBack: heldBackSet.size },
  });

  return NextResponse.json({ advanced: toAdvance.length, heldBack: heldBackSet.size });
}
export const POST = withErrors(POST_handler);
