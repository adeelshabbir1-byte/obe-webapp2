import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!instrument || instrument.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Recompute weightPct for any lecture rows that were linked to this instrument.
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: params.instrumentId } });
  await prisma.assessmentInstrument.delete({ where: { id: params.instrumentId } });

  for (const link of links) {
    const remaining = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: link.lectureRowId }, include: { instrument: true } });
    const total = remaining.reduce((sum, l) => sum + l.instrument.marksPct, 0);
    await prisma.lectureRow.update({ where: { id: link.lectureRowId }, data: { weightPct: total } });
  }

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENT_DELETED", entityType: "AssessmentInstrument", entityId: params.instrumentId });

  return NextResponse.json({ ok: true });
}
