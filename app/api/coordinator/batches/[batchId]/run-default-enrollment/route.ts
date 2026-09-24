import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Enrolls every student in this batch into every offered, non-elective
// course (Core/IDS/General Education/Lab — never Elective, since a
// student explicitly chooses those themselves) at their own
// currentSemesterNumber. Never touches a student already enrolled in a
// given course, and never touches Elective courses at all.
export async function POST(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const students = await prisma.student.findMany({ where: { batchId: batch.id } });

  let totalEnrolled = 0;
  const perStudent: { studentId: string; name: string; enrolled: number }[] = [];

  for (const student of students) {
    const defaultCourses = await prisma.course.findMany({
      where: { batchId: batch.id, isOffered: true, semesterNumber: student.currentSemesterNumber, courseType: { not: "Elective" } },
    });
    let enrolledForThisStudent = 0;
    for (const course of defaultCourses) {
      const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: course.id } } });
      if (!existing) {
        await prisma.studentEnrollment.create({ data: { studentId: student.id, courseId: course.id, isRepeat: false } });
        enrolledForThisStudent++;
      }
    }
    if (enrolledForThisStudent > 0) perStudent.push({ studentId: student.id, name: student.name, enrolled: enrolledForThisStudent });
    totalEnrolled += enrolledForThisStudent;
  }

  await writeAuditLog({ actorUserId: user.id, action: "DEFAULT_ENROLLMENT_RUN", entityType: "Batch", entityId: batch.id, metadata: { totalEnrolled, studentsAffected: perStudent.length } });

  return NextResponse.json({ totalEnrolled, studentsAffected: perStudent.length, totalStudents: students.length });
}
