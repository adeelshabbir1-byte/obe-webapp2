import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (course.courseType === "Lab") return NextResponse.json({ error: "this course is already a Lab course" }, { status: 400 });

  const body = await req.json();
  const labCredit = parseInt(body.labCreditHours, 10);
  if (isNaN(labCredit) || labCredit < 1 || labCredit >= course.creditHours) {
    return NextResponse.json({ error: "labCreditHours must be at least 1 and less than the course's current credit hours" }, { status: 400 });
  }

  const theoryCredit = course.creditHours - labCredit;
  const labCode = `${course.code}-L`;

  const existing = await prisma.course.findFirst({ where: { coordinatorId: user.id, batchId: course.batchId, code: labCode } });
  if (existing) return NextResponse.json({ error: `a course with code ${labCode} already exists in this batch` }, { status: 400 });

  const [updatedTheory, labCourse] = await prisma.$transaction([
    prisma.course.update({ where: { id: course.id }, data: { creditHours: theoryCredit } }),
    prisma.course.create({
      data: {
        coordinatorId: course.coordinatorId, batchId: course.batchId, code: labCode, title: `${course.title} Lab`,
        creditHours: labCredit, courseType: "Lab", semesterNumber: course.semesterNumber,
        masterCourseId: course.masterCourseId,
      },
    }),
  ]);

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_SPLIT_INTO_LAB", entityType: "Course", entityId: course.id, metadata: { labCourseId: labCourse.id, theoryCredit, labCredit } });

  return NextResponse.json({ theoryCourse: updatedTheory, labCourse });
}
