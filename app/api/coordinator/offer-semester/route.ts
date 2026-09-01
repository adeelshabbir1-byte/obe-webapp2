import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";

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
    const result = await prisma.course.updateMany({
      where: { batchId: batch.id, semesterNumber, isOffered: false },
      data: { isOffered: true, offeredTermName: current.termName, offeredTermYear: current.year },
    });
    offered += result.count;
    perBatch.push({ batchName: `${batch.degreeProgram} — ${batch.batchName}`, semesterNumber, coursesOffered: result.count });
  }

  await writeAuditLog({ actorUserId: user.id, action: "SEMESTER_OFFERED", metadata: { termName: current.termName, year: current.year, offered } });

  return NextResponse.json({ offered, perBatch, currentTerm: current });
}
