import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.week || !body.lectureNumber || !body.topic) {
    return NextResponse.json({ error: "week, lectureNumber, topic are required" }, { status: 400 });
  }

  const existing = await prisma.lectureRow.findFirst({
    where: { courseId: course.id, lectureNumber: parseInt(body.lectureNumber, 10) },
  });
  if (existing) return NextResponse.json({ error: "a lecture with this number already exists" }, { status: 409 });

  const row = await prisma.lectureRow.create({
    data: {
      courseId: course.id,
      week: parseInt(body.week, 10),
      lectureNumber: parseInt(body.lectureNumber, 10),
      topic: body.topic,
      subtopic: body.subtopic || null,
      cloId: body.cloId || null,
      bloomLevel: body.bloomLevel || null,
      weightPct: body.weightPct ? parseInt(body.weightPct, 10) : 0,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_ADDED", entityType: "LectureRow", entityId: row.id });

  return NextResponse.json({ row }, { status: 201 });
}
