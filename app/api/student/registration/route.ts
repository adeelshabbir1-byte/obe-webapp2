import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });

  const myEnrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: student.id, course: { isOffered: true } },
    include: { course: true },
  });
  const myCourseIds = new Set(myEnrollments.map((e) => e.courseId));

  // Electives in the student's own batch, at their own current semester,
  // that they're not already enrolled in — the only thing they can
  // self-register for; core/default courses come from the Coordinator's
  // batch-wide enrollment run, not individual choice.
  const availableElectives = await prisma.course.findMany({
    where: { batchId: batch.id, isOffered: true, courseType: "Elective", semesterNumber: student.currentSemesterNumber, id: { notIn: Array.from(myCourseIds) } },
    orderBy: { code: "asc" },
  });

  // Other batches of the SAME degree program — candidates for an
  // out-of-batch request (a different cohort's offering of a course
  // this student needs).
  const otherBatchCourses = await prisma.course.findMany({
    where: { batch: { degreeProgram: batch.degreeProgram, id: { not: batch.id } }, isOffered: true, id: { notIn: Array.from(myCourseIds) } },
    include: { batch: true },
    orderBy: { code: "asc" },
  });

  const myOutOfBatchRequests = await prisma.outOfBatchRequest.findMany({
    where: { studentId: student.id },
    include: { course: { include: { batch: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    registrationOpen: batch.registrationOpen,
    currentSemesterNumber: student.currentSemesterNumber,
    myEnrollments: myEnrollments.map((e) => ({ id: e.id, courseId: e.courseId, code: e.course.code, title: e.course.title, courseType: e.course.courseType })),
    availableElectives: availableElectives.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours })),
    otherBatchCourses: otherBatchCourses.map((c) => ({ id: c.id, code: c.code, title: c.title, batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", semesterNumber: c.semesterNumber })),
    myOutOfBatchRequests: myOutOfBatchRequests.map((r) => ({
      id: r.id, status: r.status, reviewNote: r.reviewNote, courseCode: r.course.code, courseTitle: r.course.title,
      batchLabel: r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—",
    })),
  });
}
