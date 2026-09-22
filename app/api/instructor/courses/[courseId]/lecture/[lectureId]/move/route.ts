import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../../lib/instructorGuard";

export async function POST(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const direction = body.direction === "up" ? -1 : body.direction === "down" ? 1 : null;
  if (!direction) return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });

  const targetLectureNumber = row.lectureNumber + direction;
  const target = await prisma.lectureRow.findFirst({ where: { courseId: course.id, source: "INSTRUCTOR", lectureNumber: targetLectureNumber } });
  if (!target) return NextResponse.json({ error: "already at the edge — nothing to swap with" }, { status: 400 });

  // Swap the CONTENT (topic, sub-topic, CLO, Bloom level, weight) between the
  // two positions — the date and week/lecture number stay tied to the slot,
  // not the content, since dates are calendar-based.
  await prisma.$transaction([
    prisma.lectureRow.update({
      where: { id: row.id },
      data: { topic: target.topic, subtopic: target.subtopic, cloId: target.cloId, bloomLevel: target.bloomLevel, weightPct: target.weightPct },
    }),
    prisma.lectureRow.update({
      where: { id: target.id },
      data: { topic: row.topic, subtopic: row.subtopic, cloId: row.cloId, bloomLevel: row.bloomLevel, weightPct: row.weightPct },
    }),
  ]);

  // Only these two rows' content changed — return both so the client
  // can update just them, not the whole 32-row list.
  const [updatedRow, updatedTarget] = await Promise.all([
    prisma.lectureRow.findUnique({ where: { id: row.id } }),
    prisma.lectureRow.findUnique({ where: { id: target.id } }),
  ]);
  return NextResponse.json({ rows: [updatedRow, updatedTarget] });
}
