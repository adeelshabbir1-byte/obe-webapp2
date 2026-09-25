import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";
import { autoEnrollBatchStudents } from "../../../../lib/autoEnroll";
import { carryOverFromMatchingSemester } from "../../../../lib/benchmarkCopy";
import { snapshotCourseAssignmentsIfTermChanging, snapshotAttainmentAndResetIfTermChanging } from "../../../../lib/assignmentSnapshot";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const current = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });
  if (!current) return NextResponse.json({ error: "set the current term first" }, { status: 400 });

  if (current.termName === "Summer") {
    return NextResponse.json({
      error: "Summer doesn't auto-advance batches to a new semester — use 'Summer Repeat Offerings' below to manually activate specific courses for students retaking them.",
    }, { status: 400 });
  }

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });

  let offered = 0;
  let unOffered = 0;
  const perBatch: { batchName: string; semesterNumber: number; coursesOffered: number; coursesUnOffered?: number; notStarted?: boolean; prerequisitesNotConfirmed?: boolean }[] = [];

  for (const batch of batches) {
    const semesterNumber = computeCurrentSemesterNumber(batch, current);
    if (semesterNumber < 1) {
      // This batch's own start term hasn't arrived yet — never offer
      // anything for it just because it's clamped, per an earlier bug.
      perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, semesterNumber, coursesOffered: 0, notStarted: true });
      continue;
    }
    if (!batch.prerequisitesConfirmedAt) {
      // Prerequisite Map is a required one-time setup step before a batch's
      // courses can ever be offered.
      perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, semesterNumber, coursesOffered: 0, prerequisitesNotConfirmed: true });
      continue;
    }
    const coursesToOffer = await prisma.course.findMany({ where: { batchId: batch.id, semesterNumber, isOffered: false } });
    if (coursesToOffer.length > 0) {
      for (const c of coursesToOffer) {
        await snapshotCourseAssignmentsIfTermChanging(c.id, current.termName, current.year);
        await snapshotAttainmentAndResetIfTermChanging(c.id, current.termName, current.year);
      }
      await prisma.course.updateMany({
        where: { id: { in: coursesToOffer.map((c) => c.id) } },
        data: { isOffered: true, offeredTermName: current.termName, offeredTermYear: current.year },
      });
      for (const c of coursesToOffer) {
        await autoEnrollBatchStudents(c.id, batch.id);
        await carryOverFromMatchingSemester(c.id);
      }
    }
    // A batch is only ever genuinely "in" one semester at a time — once
    // it advances, any of its OWN courses still flagged offered from a
    // different, now-completed semester need to come off the active
    // list too, or they keep showing as currently offered alongside the
    // new semester's courses forever (the bug this fixes). This only
    // flips isOffered — offeredTermName/Year stay put as a historical
    // record of when it ran, and grades/enrollment are never touched,
    // unlike the snapshot-and-reset path above which is for re-offering
    // the SAME course under a new term, not a different course entirely.
    // Summer repeat offerings (offeredTermName "Summer", set only by the
    // dedicated repeat-offer endpoint for a student retaking an
    // out-of-sequence course) are deliberately excluded — those aren't
    // part of this batch's normal Fall/Spring progression and must stay
    // exactly as the Coordinator set them.
    const previousSemesterCourses = await prisma.course.findMany({
      where: { batchId: batch.id, isOffered: true, semesterNumber: { not: semesterNumber }, offeredTermName: { not: "Summer" } },
      select: { id: true },
    });
    if (previousSemesterCourses.length > 0) {
      await prisma.course.updateMany({
        where: { id: { in: previousSemesterCourses.map((c) => c.id) } },
        data: { isOffered: false },
      });
    }
    unOffered += previousSemesterCourses.length;
    offered += coursesToOffer.length;
    perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, semesterNumber, coursesOffered: coursesToOffer.length, coursesUnOffered: previousSemesterCourses.length || undefined });
  }

  await writeAuditLog({ actorUserId: user.id, action: "SEMESTER_OFFERED", metadata: { termName: current.termName, year: current.year, offered, unOffered } });

  return NextResponse.json({ offered, unOffered, perBatch, currentTerm: current });
}
