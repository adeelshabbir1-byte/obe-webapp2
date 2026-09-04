import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });
  const lec1 = rows.find((r) => r.lectureNumber === 1);
  const lec2 = rows.find((r) => r.lectureNumber === 2);
  if (!lec1?.actualDate || !lec2?.actualDate) {
    return NextResponse.json({ error: "set the actual date for lecture 1 and lecture 2 first — the rest fill in from that weekly pattern" }, { status: 400 });
  }

  const holidays = await prisma.holiday.findMany({ where: { coordinatorId: course.coordinatorId } });
  const blockedDates = new Set<string>(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  // Degree-wide semester dates are the default; a course's own dates (if set) override them.
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
  function blockRange(start: Date | null, end: Date | null) {
    if (!start) return;
    const rangeEnd = end || start;
    let d = new Date(start);
    let guard = 0;
    while (d <= rangeEnd && guard < 14) {
      blockedDates.add(d.toISOString().slice(0, 10));
      d = addDays(d, 1);
      guard++;
    }
  }
  blockRange(midtermStart, midtermEnd);
  blockRange(finalStart, finalEnd);

  const d1 = new Date(lec1.actualDate);
  const d2 = new Date(lec2.actualDate);

  let filled = 0;
  for (const row of rows) {
    if (row.lectureNumber <= 2) continue; // anchors stay as manually set
    if (row.actualDate) continue; // don't overwrite a date the instructor already set/changed

    const weekOffset = Math.floor((row.lectureNumber - 1) / 2);
    const isFirstOfWeek = (row.lectureNumber - 1) % 2 === 0;
    const naturalDate = addDays(isFirstOfWeek ? d1 : d2, weekOffset * 7);
    let candidate = naturalDate;

    let guard = 0;
    let rescheduledFrom: string | null = null;
    while (blockedDates.has(candidate.toISOString().slice(0, 10)) && guard < 12) {
      if (!rescheduledFrom) rescheduledFrom = candidate.toISOString().slice(0, 10);
      candidate = addDays(candidate, 7);
      guard++;
    }

    await prisma.lectureRow.update({
      where: { id: row.id },
      data: {
        actualDate: candidate,
        rescheduledNote: rescheduledFrom ? `Rescheduled — originally ${rescheduledFrom} fell on a holiday or exam date` : null,
      },
    });
    filled++;
  }

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_DATES_AUTO_FILLED", entityType: "Course", entityId: course.id, metadata: { filled } });

  return NextResponse.json({ filled });
}
