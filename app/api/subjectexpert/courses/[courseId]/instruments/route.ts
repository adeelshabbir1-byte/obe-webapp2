import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

const TYPES = ["Assignment", "Quiz", "Midterm", "Final", "Project", "Lab"];

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.type || !TYPES.includes(body.type) || !body.label || body.marksPct === undefined) {
    return NextResponse.json({ error: "type, label, marksPct are required" }, { status: 400 });
  }

  const marksPct = parseInt(body.marksPct, 10);
  if (isNaN(marksPct) || marksPct < 0 || marksPct > 100) {
    return NextResponse.json({ error: "marksPct must be between 0 and 100" }, { status: 400 });
  }

  const instrument = await prisma.assessmentInstrument.create({
    data: { courseId: course.id, type: body.type, label: body.label, marksPct },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENT_ADDED", entityType: "AssessmentInstrument", entityId: instrument.id });

  return NextResponse.json({ instrument }, { status: 201 });
}
