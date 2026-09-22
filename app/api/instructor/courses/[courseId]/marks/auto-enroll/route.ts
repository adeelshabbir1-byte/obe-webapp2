import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user || !course.batchId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const students = await prisma.student.findMany({ where: { batchId: course.batchId } });
  let enrolled = 0;
  for (const s of students) {
    const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: s.id, courseId: course.id } } });
    if (!existing) {
      await prisma.studentEnrollment.create({ data: { studentId: s.id, courseId: course.id, isRepeat: false } });
      enrolled++;
    }
  }

  // Bulk, rare action — returning the full fresh enrollment list here
  // (not the whole page) is still far cheaper than a full page refetch.
  const [allEnrollments, allMarks] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, include: { student: true } }),
    prisma.studentMark.findMany({ where: { courseId: course.id } }),
  ]);
  const marksByStudent = new Map<string, Record<string, number>>();
  for (const m of allMarks) {
    if (!marksByStudent.has(m.studentId)) marksByStudent.set(m.studentId, {});
    marksByStudent.get(m.studentId)![m.instrumentId] = m.score;
  }
  const allStudents = allEnrollments.map((e) => ({
    id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat,
    marks: marksByStudent.get(e.student.id) || {},
  }));
  return NextResponse.json({ enrolled, students: allStudents });
}
