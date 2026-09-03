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
  if (course.midtermDate) blockedDates.add(course.midtermDate.toISOString().slice(0, 10));
  if (course.finalDate) blockedDates.add(course.finalDate.toISOString().slice(0, 10));

  const d1 = new Date(lec1.actualDate);
  const d2 = new Date(lec2.actualDate);

  let filled = 0;
  for (const row of rows) {
    if (row.lectureNumber <= 2) continue; // anchors stay as manually set
    if (row.actualDate) continue; // don't overwrite a date the instructor already set/changed

    const weekOffset = Math.floor((row.lectureNumber - 1) / 2);
    const isFirstOfWeek = (row.lectureNumber - 1) % 2 === 0;
    let candidate = addDays(isFirstOfWeek ? d1 : d2, weekOffset * 7);

    let guard = 0;
    while (blockedDates.has(candidate.toISOString().slice(0, 10)) && guard < 12) {
      candidate = addDays(candidate, 7);
      guard++;
    }

    await prisma.lectureRow.update({ where: { id: row.id }, data: { actualDate: candidate } });
    filled++;
  }

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_DATES_AUTO_FILLED", entityType: "Course", entityId: course.id, metadata: { filled } });

  return NextResponse.json({ filled });
}
