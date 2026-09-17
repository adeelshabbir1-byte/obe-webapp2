import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existingCount = await prisma.lectureRow.count({ where: { courseId: course.id, source: "SE" } });
  if (existingCount > 0) {
    return NextResponse.json({ error: "lecture rows already exist for this course" }, { status: 409 });
  }

  // 32 lectures, 2 per week — Week and Lecture # are fixed; everything else
  // (Topic, Sub Topic, CLO, Bloom, Weight) is filled in afterward.
  const rows = Array.from({ length: 32 }, (_, i) => ({
    courseId: course.id,
    source: "SE",
    lectureNumber: i + 1,
    week: Math.ceil((i + 1) / 2),
    topic: "",
    subtopic: null,
    cloId: null,
    bloomLevel: null,
    weightPct: 0,
  }));

  await prisma.lectureRow.createMany({ data: rows });
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_TEMPLATE_GENERATED", entityType: "Course", entityId: course.id });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ created: rows.length }, { status: 201 });
}
