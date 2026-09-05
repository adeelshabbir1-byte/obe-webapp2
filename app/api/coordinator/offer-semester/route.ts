import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";
import { autoEnrollBatchStudents } from "../../../../lib/autoEnroll";
import { carryOverFromMatchingSemester } from "../../../../lib/benchmarkCopy";
import { snapshotCourseAssignmentsIfTermChanging } from "../../../../lib/assignmentSnapshot";

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
  const perBatch: { batchName: string; semesterNumber: number; coursesOffered: number }[] = [];

  for (const batch of batches) {
    const semesterNumber = computeCurrentSemesterNumber(batch, current);
    const coursesToOffer = await prisma.course.findMany({ where: { batchId: batch.id, semesterNumber, isOffered: false } });
    if (coursesToOffer.length > 0) {
      for (const c of coursesToOffer) await snapshotCourseAssignmentsIfTermChanging(c.id, current.termName, current.year);
      await prisma.course.updateMany({
        where: { id: { in: coursesToOffer.map((c) => c.id) } },
        data: { isOffered: true, offeredTermName: current.termName, offeredTermYear: current.year },
      });
      for (const c of coursesToOffer) {
        await autoEnrollBatchStudents(c.id, batch.id);
        await carryOverFromMatchingSemester(c.id);
      }
    }
    offered += coursesToOffer.length;
    perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, semesterNumber, coursesOffered: coursesToOffer.length });
  }

  await writeAuditLog({ actorUserId: user.id, action: "SEMESTER_OFFERED", metadata: { termName: current.termName, year: current.year, offered } });

  return NextResponse.json({ offered, perBatch, currentTerm: current });
}
