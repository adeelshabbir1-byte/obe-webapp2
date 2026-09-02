import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../../lib/instructorGuard";
import { recomputeAffectedRows } from "../../../../../../../../lib/lectureWeights";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const type: string = body.type;
  const raw: string = body.numbers || "";
  if (type !== "Midterm" && type !== "Final") return NextResponse.json({ error: "type must be Midterm or Final" }, { status: 400 });

  const numbers = raw.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0);
  const allOfType = await prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", type } });
  const byLabel = new Map(allOfType.map((i) => [i.label, i]));

  const invalid = numbers.filter((n: string) => !byLabel.has(n));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `${type} question(s) not defined yet: ${invalid.join(", ")} — add them on the Instruments tab first` }, { status: 400 });
  }

  const existingLinksOfType = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: row.id, instrument: { type, source: "INSTRUCTOR" } } });
  const removedInstrumentIds = existingLinksOfType.map((l) => l.instrumentId);
  await prisma.lectureRowInstrument.deleteMany({ where: { id: { in: existingLinksOfType.map((l) => l.id) } } });

  for (const n of numbers) {
    const instrument = byLabel.get(n)!;
    await prisma.lectureRowInstrument.create({ data: { lectureRowId: row.id, instrumentId: instrument.id } });
  }

  const addedInstrumentIds = numbers.map((n: string) => byLabel.get(n)!.id);
  await recomputeAffectedRows([...new Set([...removedInstrumentIds, ...addedInstrumentIds])]);

  const updatedRow = await prisma.lectureRow.findUnique({ where: { id: row.id } });
  return NextResponse.json({ weightPct: updatedRow?.weightPct ?? 0 });
}
