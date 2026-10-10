import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { studentId, instrumentId, score } = body;
  if (!studentId || !instrumentId || score === undefined) return NextResponse.json({ error: "studentId, instrumentId, score are required" }, { status: 400 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } });
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "INSTRUCTOR") return NextResponse.json({ error: "invalid instrument" }, { status: 400 });

  const numScore = parseFloat(score);
  if (isNaN(numScore) || numScore < 0 || numScore > instrument.maxScore) {
    return NextResponse.json({ error: `score must be between 0 and ${instrument.maxScore}` }, { status: 400 });
  }

  // Only students actually enrolled in this course can be given marks.
  const enrolled = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: course.id } } });
  if (!enrolled) return NextResponse.json({ error: "that student is not enrolled in this course" }, { status: 400 });

  const before = await prisma.studentMark.findUnique({ where: { studentId_instrumentId: { studentId, instrumentId } } });
  const mark = await prisma.studentMark.upsert({
    where: { studentId_instrumentId: { studentId, instrumentId } },
    create: { studentId, courseId: course.id, instrumentId, score: numScore, enteredById: user.id },
    update: { score: numScore, enteredById: user.id },
  });

  // Marks decide grades, so every entry and change leaves a trail (who, which student and assessment, old and new value).
  await writeAuditLog({ actorUserId: user.id, action: before ? "MARK_CHANGED" : "MARK_ENTERED", entityType: "StudentMark", entityId: mark.id, metadata: { courseId: course.id, studentId, instrumentId, from: before ? before.score : null, to: numScore } });

  return NextResponse.json({ mark });
}
