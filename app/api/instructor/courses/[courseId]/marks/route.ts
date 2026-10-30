import { NextRequest, NextResponse } from "next/server";
import { resultLockMessage } from "../../../../../../lib/resultApproval";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { collegeMarksBlock } from "../../../../../../lib/affiliates";
import { withErrors } from "../../../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  { const locked = await resultLockMessage(course.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }

  const body = await req.json();
  const { studentId, instrumentId, score } = body;
  if (!studentId || !instrumentId || score === undefined) return NextResponse.json({ error: "studentId, instrumentId, score are required" }, { status: 400 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } });
  { const uniOnly = await collegeMarksBlock(course.id, [instrumentId]); if (uniOnly) return NextResponse.json({ error: uniOnly }, { status: 409 }); }
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "INSTRUCTOR") return NextResponse.json({ error: "invalid instrument" }, { status: 400 });

  { const lk = await import("../../../../../../lib/itemWarnings").then((m) => m.lateLock(course.id, instrumentId)).catch(() => null); if (lk) return NextResponse.json({ error: lk }, { status: 409 }); }
  // An empty cell (or "A" / "Abs") means absent: the mark is removed, never saved as 0.
  if (score === null || /^\s*(a|abs|absent)?\s*$/i.test(String(score))) {
    const old = await prisma.studentMark.findUnique({ where: { studentId_instrumentId: { studentId, instrumentId } } });
    if (old) {
      await prisma.studentMark.delete({ where: { id: old.id } });
      await writeAuditLog({ actorUserId: user.id, action: "MARK_CHANGED", entityType: "StudentMark", entityId: old.id, metadata: { courseId: course.id, studentId, instrumentId, from: old.score, to: "absent" } });
    }
    return NextResponse.json({ mark: null, absent: true });
  }
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

  // Marks deadline (late stamp) and the early warning for this item.
  await import("../../../../../../lib/itemWarnings").then((m) => m.afterMarks(course.id, instrumentId)).catch((e) => console.warn("after marks:", (e as Error).message));
  return NextResponse.json({ mark });
}
export const PUT = withErrors(PUT_handler);
