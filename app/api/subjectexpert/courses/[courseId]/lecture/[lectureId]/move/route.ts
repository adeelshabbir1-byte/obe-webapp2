import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../../lib/audit";

// Same "swap the content between two slots" move the Instructor's own
// lecture editor already has — SE simply never got the same ▲▼ buttons
// when this screen was originally built. Week/lecture number stay tied
// to the row position (same as the Instructor version); only the
// content (topic, subtopic, CLO, Bloom level, weight) moves.
export async function POST(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const direction = body.direction === "up" ? -1 : body.direction === "down" ? 1 : null;
  if (!direction) return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });

  const targetLectureNumber = row.lectureNumber + direction;
  const target = await prisma.lectureRow.findFirst({ where: { courseId: course.id, source: "SE", lectureNumber: targetLectureNumber } });
  if (!target) return NextResponse.json({ error: "already at the edge — nothing to swap with" }, { status: 400 });

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

  const [updatedRow, updatedTarget] = await Promise.all([
    prisma.lectureRow.findUnique({ where: { id: row.id } }),
    prisma.lectureRow.findUnique({ where: { id: target.id } }),
  ]);

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_MOVED", entityType: "LectureRow", entityId: row.id, metadata: { direction: body.direction } });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ rows: [updatedRow, updatedTarget] });
}
