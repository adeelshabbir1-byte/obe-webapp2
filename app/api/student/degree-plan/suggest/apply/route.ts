import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../../lib/studentSession";
import { prisma } from "../../../../../../lib/db";
import { suggestSchedule } from "../../../../../../lib/suggestSchedule";
import { withErrors } from "../../../../../../lib/apiHandler";

// Commits the suggested schedule to DegreePlanEntry — recomputed fresh here
// (not trusting a client-submitted plan) so it reflects the current state
// even if something changed since the preview was shown a moment ago.
// Every course it places becomes a normal, still-editable planned entry,
// exactly as if the student had dragged each one into place by hand.
async function POST_handler() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const schedule = await suggestSchedule(student.id);
  if (!schedule) return NextResponse.json({ error: "Nothing left to schedule." }, { status: 400 });

  const courses = schedule.bySemester.flatMap((s) => s.courses);
  await prisma.$transaction(
    courses.map((c) =>
      prisma.degreePlanEntry.upsert({
        where: { studentId_courseId: { studentId: student.id, courseId: c.courseId } },
        update: { plannedSemesterNumber: c.suggestedSemesterNumber },
        create: { studentId: student.id, courseId: c.courseId, plannedSemesterNumber: c.suggestedSemesterNumber },
      })
    )
  );

  return NextResponse.json({ ok: true, coursesPlaced: courses.length });
}
export const POST = withErrors(POST_handler);
