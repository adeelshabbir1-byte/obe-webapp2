import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { courseAppliesToTrack } from "../../../../../../lib/tracks";

// Enrolls every student in this batch into every offered, non-elective
// course (Core/IDS/General Education/Lab — never Elective, since a
// student explicitly chooses those themselves) at their own
// currentSemesterNumber. Never touches a student already enrolled in a
// given course, and never touches Elective courses at all.
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const students = await prisma.student.findMany({ where: { batchId: batch.id } });

  // Load everything once instead of querying per student and per course.
  const offered = await prisma.course.findMany({ where: { batchId: batch.id, isOffered: true, courseType: { not: "Elective" } } });
  const existing = await prisma.studentEnrollment.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, courseId: true } });
  const have = new Set(existing.map((e) => `${e.studentId}|${e.courseId}`));

  const toCreate: { studentId: string; courseId: string; isRepeat: boolean }[] = [];
  const perStudent: { studentId: string; name: string; enrolled: number }[] = [];
  for (const student of students) {
    // Track-aware: a Pre-Medical student gets the shared courses plus the
    // Pre-Medical-only ones (e.g. Maths-I deficiency), never the Non-Medical-only ones.
    const defaultCourses = offered.filter((c) => c.semesterNumber === student.currentSemesterNumber && courseAppliesToTrack(c.trackName, student.track));
    let n = 0;
    for (const course of defaultCourses) {
      if (have.has(`${student.id}|${course.id}`)) continue;
      toCreate.push({ studentId: student.id, courseId: course.id, isRepeat: false });
      n++;
    }
    if (n > 0) perStudent.push({ studentId: student.id, name: student.name, enrolled: n });
  }
  for (let i = 0; i < toCreate.length; i += 1000) {
    await prisma.studentEnrollment.createMany({ data: toCreate.slice(i, i + 1000), skipDuplicates: true });
  }
  const totalEnrolled = toCreate.length;

  await writeAuditLog({ actorUserId: user.id, action: "DEFAULT_ENROLLMENT_RUN", entityType: "Batch", entityId: batch.id, metadata: { totalEnrolled, studentsAffected: perStudent.length } });

  return NextResponse.json({ totalEnrolled, studentsAffected: perStudent.length, totalStudents: students.length });
}
