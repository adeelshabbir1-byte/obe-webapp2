import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { recomputeRowWeight } from "../../../../../../../lib/lectureWeights";

export async function DELETE(req: Request, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  // Links must be removed BEFORE the instrument itself (foreign key), and we
  // need the affected row IDs first so we can recompute their weight after.
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: params.instrumentId } });
  const affectedRowIds = links.map((l) => l.lectureRowId);

  await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: params.instrumentId } });
  await prisma.assessmentInstrument.delete({ where: { id: params.instrumentId } });

  for (const rowId of affectedRowIds) {
    await recomputeRowWeight(rowId);
  }

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENT_DELETED", entityType: "AssessmentInstrument", entityId: params.instrumentId });

  return NextResponse.json({ ok: true });
}
