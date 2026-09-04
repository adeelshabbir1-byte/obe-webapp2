import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Bulk-add students to this course by roll number — looked up from the
// existing Student records in the course's home batch (no new student data
// entered here, just referencing who's already registered).
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user || !course.batchId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const rollNumbers: string[] = (body.rollNumbers || "")
    .split(/[\n,]/).map((r: string) => r.trim()).filter((r: string) => r.length > 0);
  if (rollNumbers.length === 0) return NextResponse.json({ error: "no roll numbers provided" }, { status: 400 });

  const students = await prisma.student.findMany({ where: { batchId: course.batchId, rollNumber: { in: rollNumbers } } });
  const foundRolls = new Set(students.map((s) => s.rollNumber));
  const notFound = rollNumbers.filter((r) => !foundRolls.has(r));

  let added = 0;
  for (const s of students) {
    const existing = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: s.id, courseId: course.id } } });
    if (!existing) {
      await prisma.studentEnrollment.create({ data: { studentId: s.id, courseId: course.id, isRepeat: s.batchId !== course.batchId } });
      added++;
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_STUDENTS_ADDED", entityType: "Course", entityId: course.id, metadata: { added, notFound: notFound.join(", ") } });

  return NextResponse.json({ added, notFound: notFound.length > 0 ? notFound : undefined });
}

// Drop a single student from this course.
export async function DELETE(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  await prisma.studentMark.deleteMany({ where: { studentId: body.studentId, courseId: course.id } });
  await prisma.studentEnrollment.deleteMany({ where: { studentId: body.studentId, courseId: course.id } });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_STUDENT_DROPPED", entityType: "Course", entityId: course.id, metadata: { studentId: body.studentId } });

  return NextResponse.json({ ok: true });
}
