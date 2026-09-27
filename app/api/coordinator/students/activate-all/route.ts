import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";

// One-click login activation across EVERY batch this Coordinator owns —
// but only for students who haven't finished their degree yet. "Finished"
// is judged the same way a transcript would: a student's own earned
// credit hours (passing grades only, matching the pass/fail rule used
// elsewhere for prerequisites — anything other than D or F counts) vs.
// their batch's total credit hours (the sum of every course currently
// set up for that batch, i.e. the full 8-semester plan SE built).
//
// A batch with no courses set up yet (0 total credit hours) can't be
// judged either way — those students are treated as not-yet-finished
// (activated), since silently skipping them would be the more
// surprising failure mode.
//
// Only ever fills gaps: a student who already has a password is left
// alone here, same as the single-batch "Activate New Logins" button.
// This never resets anyone — there's no bulk-force option by design,
// since a mass password reset across the whole institution is exactly
// the kind of one-click action that shouldn't exist.
export async function POST(_req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });

  let activated = 0;
  let skippedGraduated = 0;
  let skippedAlreadyActive = 0;
  const perBatch: { batchName: string; activated: number; skippedGraduated: number; skippedAlreadyActive: number }[] = [];

  for (const batch of batches) {
    const courses = await prisma.course.findMany({ where: { batchId: batch.id }, select: { creditHours: true } });
    const totalCreditHours = courses.reduce((sum, c) => sum + c.creditHours, 0);

    const students = await prisma.student.findMany({ where: { batchId: batch.id } });
    let batchActivated = 0, batchGraduated = 0, batchAlreadyActive = 0;

    for (const s of students) {
      if (s.passwordHash) { batchAlreadyActive++; continue; }

      if (totalCreditHours > 0) {
        const records = await prisma.studentTranscriptRecord.findMany({
          where: { studentId: s.id },
          select: { creditHours: true, grade: true },
        });
        const earnedCreditHours = records.reduce((sum, r) => (r.grade !== "F" && r.grade !== "D" ? sum + r.creditHours : sum), 0);
        if (earnedCreditHours >= totalCreditHours) { batchGraduated++; continue; }
      }

      const hash = await hashPassword(s.rollNumber);
      await prisma.student.update({ where: { id: s.id }, data: { passwordHash: hash, mustChangePassword: true } });
      batchActivated++;
    }

    activated += batchActivated;
    skippedGraduated += batchGraduated;
    skippedAlreadyActive += batchAlreadyActive;
    perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, activated: batchActivated, skippedGraduated: batchGraduated, skippedAlreadyActive: batchAlreadyActive });
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "STUDENT_LOGINS_ACTIVATED_ALL_BATCHES",
    metadata: { activated, skippedGraduated, skippedAlreadyActive },
  });

  return NextResponse.json({ activated, skippedGraduated, skippedAlreadyActive, perBatch });
}
