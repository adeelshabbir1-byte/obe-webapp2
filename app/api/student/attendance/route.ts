import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { STANDING_LABEL, attendancePolicy, standing, tally } from "../../../../lib/attendance";

export const dynamic = "force-dynamic";

// GET — the signed-in student's attendance in each course this semester, with where they stand against the
// institute's minimum. ?courseId= adds the lecture-by-lecture record of one course.
export async function GET(req: NextRequest) {
  const me = await getAuthenticatedStudent();
  if (!me) return NextResponse.json({ error: "Sign in to see your attendance." }, { status: 401 });
  const batch = await prisma.batch.findUnique({ where: { id: me.batchId }, select: { coordinatorId: true } });
  const lead = batch?.coordinatorId ? await prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { id: true, role: true, managedById: true } }) : null;
  const p = await attendancePolicy(lead ? await chairmanIdFor(lead) : null);
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: me.id, status: "ACTIVE", course: { isOffered: true } },
    select: { courseId: true, course: { select: { code: true, title: true, instructor: { select: { name: true } } } } },
  });
  const ids = enrollments.map((e) => e.courseId);
  const [records, planned, held] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { studentId: me.id, courseId: { in: ids } }, select: { courseId: true, status: true, lectureRowId: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR" }, _count: { _all: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR", actualDate: { not: null } }, _count: { _all: true } }),
  ]);
  const plannedOf = new Map(planned.map((x) => [x.courseId, x._count._all]));
  const heldOf = new Map(held.map((x) => [x.courseId, x._count._all]));
  const courses = enrollments.map((e) => {
    const mine = records.filter((r) => r.courseId === e.courseId);
    const t = tally(mine.map((r) => r.status));
    // Lectures still to come in the course's plan — the same count the reports use.
    const remaining = Math.max(0, (plannedOf.get(e.courseId) || 0) - Math.max(heldOf.get(e.courseId) || 0, t.marked));
    const st = standing(t, p, remaining);
    return { courseId: e.courseId, code: e.course.code, title: e.course.title, instructor: e.course.instructor?.name || "", ...t, ...st, label: STANDING_LABEL[st.standing], remaining };
  }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

  let history: { lectureNumber: number; topic: string; date: string | null; status: string }[] | undefined;
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (courseId && ids.includes(courseId)) {
    const rows = await prisma.attendanceRecord.findMany({ where: { studentId: me.id, courseId }, select: { status: true, lectureRow: { select: { lectureNumber: true, topic: true, actualDate: true } } } });
    history = rows.map((r) => ({ lectureNumber: r.lectureRow.lectureNumber, topic: r.lectureRow.topic, date: r.lectureRow.actualDate ? r.lectureRow.actualDate.toISOString().slice(0, 10) : null, status: r.status })).sort((a, b) => a.lectureNumber - b.lectureNumber);
  }
  return NextResponse.json({ minPct: p.minPct, warnMarginPct: p.warnMarginPct, lateCountsPresent: p.lateCountsPresent, excusedExcluded: p.excusedExcluded, courses, history });
}
