import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";

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

  const mark = await prisma.studentMark.upsert({
    where: { studentId_instrumentId: { studentId, instrumentId } },
    create: { studentId, courseId: course.id, instrumentId, score: numScore, enteredById: user.id },
    update: { score: numScore, enteredById: user.id },
  });

  return NextResponse.json({ mark });
}
