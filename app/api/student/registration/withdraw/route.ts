import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  if (!batch || !batch.registrationOpen) return NextResponse.json({ error: "The add/drop window isn't open for your batch right now." }, { status: 400 });

  const body = await req.json();
  const courseId = String(body.courseId || "");
  const enrollment = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId } } });
  if (!enrollment) return NextResponse.json({ error: "You're not enrolled in that course." }, { status: 400 });

  // Only ever withdraws from an elective the student chose themselves —
  // a core/default course assigned by the Coordinator's batch-wide
  // enrollment run can't be dropped this way, by design.
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.courseType !== "Elective") {
    return NextResponse.json({ error: "Only elective courses you registered for yourself can be withdrawn here — contact your Program Coordinator for anything else." }, { status: 400 });
  }

  // Withdrawing removes any marks already recorded too, since the
  // student is no longer taking the course at all.
  await prisma.studentMark.deleteMany({ where: { studentId: student.id, courseId } });
  await prisma.studentEnrollment.delete({ where: { id: enrollment.id } });

  return NextResponse.json({ ok: true });
}
