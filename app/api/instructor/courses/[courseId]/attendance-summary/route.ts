import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { attendancePolicy, courseAttendance } from "../../../../../../lib/attendance";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { withErrors } from "../../../../../../lib/apiHandler";

async function GET_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = await attendancePolicy(await chairmanIdFor(user));
  const [deliveredLectures, att] = await Promise.all([
    prisma.lectureRow.count({ where: { courseId: course.id, source: "INSTRUCTOR", actualDate: { not: null } } }),
    courseAttendance(course.id, p),
  ]);
  // Same rule everywhere (lib/attendance.ts): late counts as attended unless the OMC says otherwise; excused leave
  // counts against the student unless the OMC leaves it out.
  const summary = att.students.map((s) => ({
    studentId: s.studentId, name: s.name, rollNumber: s.rollNumber,
    present: s.tally.present, late: s.tally.late, absent: s.tally.absent, leave: s.tally.excused, percentage: s.pct,
    flagged: s.pct !== null && s.pct < p.minPct, standing: s.standing, canMiss: s.canMiss,
  }));

  return NextResponse.json({ deliveredLectures, threshold: p.minPct, summary, remaining: att.remaining });
}
export const GET = withErrors(GET_handler);
