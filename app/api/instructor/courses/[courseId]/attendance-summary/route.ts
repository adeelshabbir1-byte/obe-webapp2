import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { getAttendanceThreshold } from "../../../../../../lib/attendanceThreshold";
import { chairmanIdFor } from "../../../../../../lib/reportScope";

export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [enrollments, deliveredLectures, records, threshold] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, include: { student: true } }),
    prisma.lectureRow.count({ where: { courseId: course.id, source: "INSTRUCTOR", actualDate: { not: null } } }),
    prisma.attendanceRecord.findMany({ where: { courseId: course.id } }),
    getAttendanceThreshold(await chairmanIdFor(user)),
  ]);

  const byStudent = new Map<string, { present: number; absent: number; leave: number }>();
  for (const r of records) {
    const e = byStudent.get(r.studentId) || { present: 0, absent: 0, leave: 0 };
    if (r.status === "PRESENT") e.present++;
    else if (r.status === "ABSENT") e.absent++;
    else if (r.status === "LEAVE") e.leave++;
    byStudent.set(r.studentId, e);
  }

  const summary = enrollments.map((en) => {
    const s = byStudent.get(en.studentId) || { present: 0, absent: 0, leave: 0 };
    const marked = s.present + s.absent + s.leave;
    const pct = marked > 0 ? Math.round((s.present / marked) * 1000) / 10 : null;
    return {
      studentId: en.studentId, name: en.student.name, rollNumber: en.student.rollNumber,
      present: s.present, absent: s.absent, leave: s.leave, percentage: pct,
      flagged: pct !== null && pct < threshold,
    };
  });

  return NextResponse.json({ deliveredLectures, threshold, summary });
}
