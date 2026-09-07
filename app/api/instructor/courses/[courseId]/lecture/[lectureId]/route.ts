import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  if (body.actualDate) {
    const dateStr = body.actualDate.slice(0, 10);
    const holiday = await prisma.holiday.findFirst({ where: { coordinatorId: course.coordinatorId, date: new Date(dateStr) } });
    if (holiday) {
      return NextResponse.json({ error: `${dateStr} is a holiday (${holiday.label}) — pick a different date, or remove the holiday first if this is intentional` }, { status: 400 });
    }

    let midtermStart = course.midtermStartDate, midtermEnd = course.midtermEndDate;
    let finalStart = course.finalStartDate, finalEnd = course.finalEndDate;
    if ((!midtermStart || !finalStart) && course.batchId) {
      const batch = await prisma.batch.findUnique({ where: { id: course.batchId } });
      if (batch && course.offeredTermName && course.offeredTermYear) {
        const semDates = await prisma.semesterDates.findUnique({
          where: { coordinatorId_degreeProgram_termName_termYear: { coordinatorId: course.coordinatorId, degreeProgram: batch.degreeProgram, termName: course.offeredTermName, termYear: course.offeredTermYear } },
        });
        if (semDates) {
          if (!midtermStart) { midtermStart = semDates.midtermStartDate; midtermEnd = semDates.midtermEndDate; }
          if (!finalStart) { finalStart = semDates.finalStartDate; finalEnd = semDates.finalEndDate; }
        }
      }
    }
    const picked = new Date(dateStr);
    function inRange(start: Date | null, end: Date | null) {
      if (!start) return false;
      const rangeEnd = end || start;
      return picked >= new Date(start.toISOString().slice(0, 10)) && picked <= new Date(rangeEnd.toISOString().slice(0, 10));
    }
    if (inRange(midtermStart, midtermEnd)) return NextResponse.json({ error: `${dateStr} falls within the Midterm exam week` }, { status: 400 });
    if (inRange(finalStart, finalEnd)) return NextResponse.json({ error: `${dateStr} falls within the Final exam week` }, { status: 400 });
  }

  const updated = await prisma.lectureRow.update({
    where: { id: params.lectureId },
    data: {
      topic: body.topic, subtopic: body.subtopic || null,
      cloId: body.cloId || null, bloomLevel: body.bloomLevel || null,
      actualDate: body.actualDate ? new Date(body.actualDate) : null,
      // A manual date change is a deliberate choice, not an auto-fill artifact — clear any stale note.
      rescheduledNote: body.actualDate && body.actualDate !== row.actualDate?.toISOString().slice(0, 10) ? null : row.rescheduledNote,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_LECTURE_UPDATED", entityType: "LectureRow", entityId: params.lectureId });
  return NextResponse.json({ row: updated });
}
