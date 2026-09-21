import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Commits the whole workspace arrangement at once: for each course
// involved, replaces its entire topic list with whatever the client
// ends up with after dragging topics around (including topics moved
// in from a different course). Simpler and safer than diffing moves
// one at a time — one atomic transaction, no partial-save states.
//
// Body: { courses: [ { courseId, topics: [ { topic, subtopic } ] } ] }
// — topics are plain text at this point (no ids needed); lectureNumber
// is assigned from array order.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const courses = body.courses;
  if (!Array.isArray(courses) || courses.length < 2 || courses.length > 3) {
    return NextResponse.json({ error: "courses must be an array of 2 or 3 entries" }, { status: 400 });
  }
  for (const c of courses) {
    if (!c.courseId || !Array.isArray(c.topics)) return NextResponse.json({ error: "each entry needs courseId and a topics array" }, { status: 400 });
  }

  const verified = await prisma.masterCourse.findMany({ where: { id: { in: courses.map((c: any) => c.courseId) } } });
  if (verified.length !== courses.length) return NextResponse.json({ error: "one or more courses not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    for (const c of courses) {
      await tx.masterCourseTopic.deleteMany({ where: { masterCourseId: c.courseId } });
      for (let i = 0; i < c.topics.length; i++) {
        const t = c.topics[i];
        if (!t.topic?.trim()) continue;
        await tx.masterCourseTopic.create({
          data: { masterCourseId: c.courseId, lectureNumber: i + 1, topic: t.topic.trim(), subtopic: t.subtopic?.trim() || null },
        });
      }
    }
  });

  await writeAuditLog({
    actorUserId: user.id, action: "MASTER_COURSE_TOPICS_REDISTRIBUTED", entityType: "MasterCourse", entityId: courses[0].courseId,
    metadata: { courseIds: courses.map((c: any) => c.courseId).join(","), totalTopics: courses.reduce((s: number, c: any) => s + c.topics.length, 0) },
  });

  return NextResponse.json({ ok: true });
}
