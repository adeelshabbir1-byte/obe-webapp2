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
  const { instrumentId, linked } = body;
  if (!instrumentId || typeof linked !== "boolean") {
    return NextResponse.json({ error: "instrumentId and linked are required" }, { status: 400 });
  }

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } });
  if (!instrument || instrument.courseId !== course.id || instrument.source !== "SE") return NextResponse.json({ error: "invalid instrument" }, { status: 400 });

  if (linked) {
    await prisma.lectureRowInstrument.upsert({
      where: { lectureRowId_instrumentId: { lectureRowId: row.id, instrumentId } },
      create: { lectureRowId: row.id, instrumentId },
      update: {},
    });
  } else {
    await prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: row.id, instrumentId } });
  }

  // Recompute every row sharing this instrument — the split changes for
  // all of them whenever the count of linked rows changes.
  await recomputeAffectedRows([instrumentId]);
  await syncCourseContentToLinkedCourses(course.id);

  // Return every row for this course (not just the one that was
  // clicked) — the weight split can shift for every row sharing this
  // instrument, so the client needs the full, fresh picture to stay
  // accurate without a full-page refetch.
  const allRows = await prisma.lectureRow.findMany({
    where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" },
    include: { instrumentLinks: { select: { instrumentId: true } } },
  });
  return NextResponse.json({ rows: allRows.map((r) => ({ id: r.id, weightPct: r.weightPct, linkedInstrumentIds: r.instrumentLinks.map((l) => l.instrumentId) })) });
}
