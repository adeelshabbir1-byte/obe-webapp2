import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../../lib/contentSync";
import { recomputeAffectedRows } from "../../../../../../../../lib/lectureWeights";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const type: string = body.type; // "Midterm" | "Final"
  const raw: string = body.numbers || "";
  if (type !== "Midterm" && type !== "Final") {
    return NextResponse.json({ error: "type must be Midterm or Final" }, { status: 400 });
  }

  // Parse "1, 3" -> ["1","3"], ignoring blanks.
  const numbers = raw.split(",").map((n: string) => n.trim()).filter((n: string) => n.length > 0);

  const allOfType = await prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "SE", type } });
  const byLabel = new Map(allOfType.map((i) => [i.label, i]));

  const invalid = numbers.filter((n: string) => !byLabel.has(n));
  if (invalid.length > 0) {
    return NextResponse.json({
      error: `${type} question(s) not defined yet: ${invalid.join(", ")} — add them on the Quizzes/Assignments/Exams tab first`,
    }, { status: 400 });
  }

  // Replace this row's links of this type with exactly the new set.
  const existingLinksOfType = await prisma.lectureRowInstrument.findMany({
    where: { lectureRowId: row.id, instrument: { type, source: "SE" } },
  });
  const removedInstrumentIds = existingLinksOfType.map((l) => l.instrumentId);
  await prisma.lectureRowInstrument.deleteMany({ where: { id: { in: existingLinksOfType.map((l) => l.id) } } });

  for (const n of numbers) {
    const instrument = byLabel.get(n)!;
    await prisma.lectureRowInstrument.create({ data: { lectureRowId: row.id, instrumentId: instrument.id } });
  }

  // Recompute every row sharing any instrument that was added or removed —
  // the split changes for all of them whenever the linked-row count changes.
  const addedInstrumentIds = numbers.map((n: string) => byLabel.get(n)!.id);
  await recomputeAffectedRows([...new Set([...removedInstrumentIds, ...addedInstrumentIds])]);
  await syncCourseContentToLinkedCourses(course.id);

  // Same reasoning as instrument-toggle: return every row so the client
  // can stay accurate without a full-page refetch.
  const allRows = await prisma.lectureRow.findMany({
    where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" },
  });
  return NextResponse.json({ rows: allRows.map((r) => ({ id: r.id, weightPct: r.weightPct, midtermQuestions: r.midtermQuestions, finalQuestions: r.finalQuestions })) });
}
