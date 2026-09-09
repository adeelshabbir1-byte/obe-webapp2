import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { recomputeRowWeight } from "../../../../../../../lib/lectureWeights";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.marksPct !== undefined) {
    const marksPct = parseInt(body.marksPct, 10);
    if (isNaN(marksPct) || marksPct < 0 || marksPct > 100) return NextResponse.json({ error: "marksPct must be between 0 and 100" }, { status: 400 });
    data.marksPct = marksPct;
  }
  if (body.maxScore !== undefined) {
    const maxScore = parseInt(body.maxScore, 10);
    if (isNaN(maxScore) || maxScore < 1) return NextResponse.json({ error: "maxScore must be at least 1" }, { status: 400 });
    data.maxScore = maxScore;
  }
  if (body.label !== undefined && body.label.trim()) data.label = body.label.trim();

  const updated = await prisma.assessmentInstrument.update({ where: { id: params.instrumentId }, data });

  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: params.instrumentId } });
  for (const link of links) await recomputeRowWeight(link.lectureRowId);

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_INSTRUMENT_UPDATED", entityType: "AssessmentInstrument", entityId: params.instrumentId, metadata: data });
  return NextResponse.json({ instrument: updated });
}

export async function DELETE(req: Request, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: params.instrumentId } });
  const affectedRowIds = links.map((l) => l.lectureRowId);
  await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: params.instrumentId } });
  await prisma.assessmentInstrument.delete({ where: { id: params.instrumentId } });
  for (const rowId of affectedRowIds) await recomputeRowWeight(rowId);

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_INSTRUMENT_DELETED", entityType: "AssessmentInstrument", entityId: params.instrumentId });
  return NextResponse.json({ ok: true });
}
