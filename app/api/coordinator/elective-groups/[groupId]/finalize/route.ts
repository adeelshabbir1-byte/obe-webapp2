import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Turns every collected choice into a real StudentEnrollment. Applies
// choices in submission order (first-come-first-served) so if an
// option's capacity fills up, whoever chose it earliest gets the seat;
// anyone who missed out is reported clearly rather than silently
// dropped, so the Coordinator can follow up (move them to another
// option, raise capacity, etc.) rather than having students find out
// only by their absence from the roster.
export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.electiveSlotGroup.findUnique({
    where: { id: params.groupId },
    include: {
      options: { include: { course: { select: { id: true, title: true } } } },
      choices: { orderBy: { submittedAt: "asc" }, include: { student: { select: { id: true, name: true, rollNumber: true } } } },
    },
  });
  if (!group || group.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (group.finalized) return NextResponse.json({ error: "already finalized" }, { status: 400 });

  const seatsTakenByOption = new Map<string, number>();
  let applied = 0;
  const waitlisted: { name: string; rollNumber: string; courseTitle: string }[] = [];
  const alreadyEnrolled: { name: string; rollNumber: string; courseTitle: string }[] = [];

  for (const choice of group.choices) {
    const option = group.options.find((o) => o.id === choice.optionId);
    if (!option) continue;

    const takenSoFar = seatsTakenByOption.get(option.id) || 0;
    if (option.capacity !== null && takenSoFar >= option.capacity) {
      waitlisted.push({ name: choice.student.name, rollNumber: choice.student.rollNumber, courseTitle: option.course.title });
      continue;
    }

    const existingEnrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId_courseId: { studentId: choice.studentId, courseId: option.courseId } },
    });
    if (existingEnrollment) {
      alreadyEnrolled.push({ name: choice.student.name, rollNumber: choice.student.rollNumber, courseTitle: option.course.title });
    } else {
      await prisma.studentEnrollment.create({ data: { studentId: choice.studentId, courseId: option.courseId, isRepeat: false } });
      applied++;
    }
    await prisma.electiveChoice.update({ where: { id: choice.id }, data: { applied: true } });
    seatsTakenByOption.set(option.id, takenSoFar + 1);
  }

  await prisma.electiveSlotGroup.update({ where: { id: group.id }, data: { finalized: true, registrationOpen: false } });

  await writeAuditLog({
    actorUserId: user.id, action: "ELECTIVE_GROUP_FINALIZED", entityType: "Batch", entityId: group.batchId,
    metadata: { groupId: group.id, applied, waitlisted: waitlisted.length, alreadyEnrolled: alreadyEnrolled.length },
  });

  return NextResponse.json({ applied, waitlisted, alreadyEnrolled });
}
