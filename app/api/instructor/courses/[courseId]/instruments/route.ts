import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { ensureInstructorCopy } from "../../../../../../lib/instructorCopy";
import { lockedWeights } from "../../../../../../lib/assessmentLock";
import { writeAuditLog } from "../../../../../../lib/audit";

const TYPES = ["Assignment", "Quiz", "Midterm", "Final", "Project", "Lab"];

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await ensureInstructorCopy(course.id);

  const body = await req.json();
  if (!body.type || !TYPES.includes(body.type) || !body.label || body.marksPct === undefined) {
    return NextResponse.json({ error: "type, label, marksPct are required" }, { status: 400 });
  }
  let marksPct = Math.round(parseFloat(body.marksPct) * 10000) / 10000;
  if (isNaN(marksPct) || marksPct < 0 || marksPct > 100) return NextResponse.json({ error: "marksPct must be between 0 and 100" }, { status: 400 });

  // Under "best K of N" every quiz or assignment carries target / K, so a newly added one takes that weight.
  const lock = await lockedWeights(course.id, "INSTRUCTOR", { [body.type]: 1 });
  if (lock.has(body.type)) marksPct = lock.get(body.type) as number;

  const instrument = await prisma.assessmentInstrument.create({
    data: { courseId: course.id, source: "INSTRUCTOR", type: body.type, label: body.label, marksPct, maxScore: body.maxScore ? parseInt(body.maxScore, 10) : 10 },
  });
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_INSTRUMENT_ADDED", entityType: "AssessmentInstrument", entityId: instrument.id });
  return NextResponse.json({ instrument }, { status: 201 });
}
