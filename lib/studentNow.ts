import { prisma } from "./db";
import { liveCourseStatus, type CourseStatus } from "./studentCourseStatus";
import { attendancePolicy, tally, standing } from "./attendance";

// This semester at a glance for one student: per enrolled course, attendance so far (and how many more classes can be
// missed), marks so far as a % of what has been assessed, class average, position band and the grade expected if the
// marks hold to the end.

export type NowRow = CourseStatus & { att: { pct: number | null; attended: number; held: number; canMiss: number | null; standing: string; minPct: number } };

export async function studentNow(studentId: string): Promise<NowRow[]> {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  const pol = await attendancePolicy(st?.batch.coordinator.managedById || null);
  const live = await liveCourseStatus(studentId).catch(() => [] as CourseStatus[]);
  const out: NowRow[] = [];
  for (const c of live) {
    const [recs, planned, heldRows] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { courseId: c.courseId, studentId }, select: { status: true } }),
      prisma.lectureRow.count({ where: { courseId: c.courseId, source: "INSTRUCTOR" } }),
      prisma.lectureRow.count({ where: { courseId: c.courseId, source: "INSTRUCTOR", actualDate: { not: null } } }),
    ]);
    const t = tally(recs.map((r) => r.status));
    const s = standing(t, pol, Math.max(0, planned - Math.max(heldRows, t.marked)));
    out.push({ ...c, att: { pct: s.pct, attended: t.present + (pol.lateCountsPresent ? t.late : 0), held: t.marked, canMiss: s.canMiss, standing: s.standing, minPct: pol.minPct } });
  }
  return out;
}
