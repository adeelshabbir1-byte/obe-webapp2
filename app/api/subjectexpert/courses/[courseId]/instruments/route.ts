import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";
import { lockedWeights, reachedDefinedCount } from "../../../../../../lib/assessmentLock";
import { writeAuditLog } from "../../../../../../lib/audit";

const TYPES = ["Assignment", "Quiz", "Midterm", "Final", "Project", "Lab"];

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  if (!body.type || !TYPES.includes(body.type) || !body.label || body.marksPct === undefined) {
    return NextResponse.json({ error: "type, label, marksPct are required" }, { status: 400 });
  }

  let marksPct = Math.round(parseFloat(body.marksPct) * 10000) / 10000;
  if (isNaN(marksPct) || marksPct < 0 || marksPct > 100) {
    return NextResponse.json({ error: "marksPct must be between 0 and 100" }, { status: 400 });
  }

  // Under "best K of N" every quiz or assignment carries target / K, so a newly added one takes that weight.
  const lock = await lockedWeights(course.id, "SE", { [body.type]: 1 });
  if (lock.has(body.type)) marksPct = lock.get(body.type) as number;

  const limit = await reachedDefinedCount(course.id, "SE", body.type);
  if (limit) return NextResponse.json({ error: `You have defined ${limit} ${body.type.toLowerCase()}(s) for this course. To add more, change the number on the Assessment Weights page first.` }, { status: 400 });

  const instrument = await prisma.assessmentInstrument.create({
    data: { courseId: course.id, type: body.type, label: body.label, marksPct, maxScore: Math.max(1, parseInt(String(body.maxScore ?? ""), 10) || 10) },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENT_ADDED", entityType: "AssessmentInstrument", entityId: instrument.id });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ instrument }, { status: 201 });
}
