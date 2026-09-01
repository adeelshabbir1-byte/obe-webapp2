import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../../lib/subjectExpertGuard";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const { instrumentId, linked } = body;
  if (!instrumentId || typeof linked !== "boolean") {
    return NextResponse.json({ error: "instrumentId and linked are required" }, { status: 400 });
  }

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } });
  if (!instrument || instrument.courseId !== course.id) return NextResponse.json({ error: "invalid instrument" }, { status: 400 });

  if (linked) {
    await prisma.lectureRowInstrument.upsert({
      where: { lectureRowId_instrumentId: { lectureRowId: row.id, instrumentId } },
      create: { lectureRowId: row.id, instrumentId },
      update: {},
    });
  } else {
    await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: row.id, instrumentId } });
  }

  // Recompute the row's total weight from all currently linked instruments.
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: row.id }, include: { instrument: true } });
  const weightPct = links.reduce((sum, l) => sum + l.instrument.marksPct, 0);
  await prisma.lectureRow.update({ where: { id: row.id }, data: { weightPct } });

  return NextResponse.json({ weightPct });
}
