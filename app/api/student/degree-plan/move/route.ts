import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";

// Moves a planned course to a different semester — but only after
// checking that the course (by code) has actually been scheduled at
// that semester number for SOME batch of the same degree program, past
// or present. This can't predict a semester that hasn't happened yet
// with full certainty, but a course's own historical semester pattern
// is the best signal available without a live scheduling system.
export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const targetSemesterNumber = parseInt(body.semesterNumber, 10);
  if (!courseId || !targetSemesterNumber || targetSemesterNumber < 1) {
    return NextResponse.json({ error: "courseId and a valid semesterNumber are required" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } });
  if (!course || course.batchId !== student.batchId) return NextResponse.json({ error: "invalid course" }, { status: 400 });
  if (targetSemesterNumber < student.currentSemesterNumber) {
    return NextResponse.json({ error: "Can't plan a course into a semester you've already passed." }, { status: 400 });
  }

  const everOfferedAtThatSemester = await prisma.course.findFirst({
    where: { code: course.code, semesterNumber: targetSemesterNumber, batch: { degreeProgram: course.batch?.degreeProgram } },
  });
  const validated = !!everOfferedAtThatSemester;

  await prisma.degreePlanEntry.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: { plannedSemesterNumber: targetSemesterNumber },
    create: { studentId: student.id, courseId: course.id, plannedSemesterNumber: targetSemesterNumber },
  });

  return NextResponse.json({
    ok: true, validated,
    warning: validated ? null : `${course.code} hasn't historically been offered in Semester ${targetSemesterNumber} for this program — double check with your Program Coordinator before relying on this plan.`,
  });
}
