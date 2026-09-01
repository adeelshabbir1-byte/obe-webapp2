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
  const type: string = body.type; // "Midterm" | "Final"
  const raw: string = body.numbers || "";
  if (type !== "Midterm" && type !== "Final") {
    return NextResponse.json({ error: "type must be Midterm or Final" }, { status: 400 });
  }

  // Parse "1, 3" -> ["1","3"], ignoring blanks.
  const numbers = raw.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0);

  const allOfType = await prisma.assessmentInstrument.findMany({ where: { courseId: course.id, type } });
  const byLabel = new Map(allOfType.map((i) => [i.label, i]));

  const invalid = numbers.filter((n: string) => !byLabel.has(n));
  if (invalid.length > 0) {
    return NextResponse.json({
      error: `${type} question(s) not defined yet: ${invalid.join(", ")} — add them on the Quizzes/Assignments/Exams tab first`,
    }, { status: 400 });
  }

  // Replace this row's links of this type with exactly the new set.
  const existingLinksOfType = await prisma.lectureRowInstrument.findMany({
    where: { lectureRowId: row.id, instrument: { type } },
  });
  await prisma.lectureRowInstrument.deleteMany({ where: { id: { in: existingLinksOfType.map((l) => l.id) } } });

  for (const n of numbers) {
    const instrument = byLabel.get(n)!;
    await prisma.lectureRowInstrument.create({ data: { lectureRowId: row.id, instrumentId: instrument.id } });
  }

  const allLinks = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: row.id }, include: { instrument: true } });
  const weightPct = allLinks.reduce((sum, l) => sum + l.instrument.marksPct, 0);
  await prisma.lectureRow.update({ where: { id: row.id }, data: { weightPct } });

  return NextResponse.json({ weightPct });
}
