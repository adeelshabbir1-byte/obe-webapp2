import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

// Fetches the full topic list for 2-3 chosen courses at once, for the
// cross-course topic redistribution workspace.
export async function GET(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseIdsParam = req.nextUrl.searchParams.get("courseIds");
  if (!courseIdsParam) return NextResponse.json({ error: "courseIds query param is required" }, { status: 400 });
  const courseIds = courseIdsParam.split(",").filter(Boolean);
  if (courseIds.length < 2 || courseIds.length > 3) return NextResponse.json({ error: "choose 2 or 3 courses" }, { status: 400 });

  const courses = await prisma.masterCourse.findMany({
    where: { id: { in: courseIds }, masterCurriculumId: params.curriculumId },
    include: { seedTopics: { orderBy: { lectureNumber: "asc" } } },
  });
  if (courses.length !== courseIds.length) return NextResponse.json({ error: "one or more courses not found in this curriculum" }, { status: 404 });

  // preserve the order the caller asked for, not DB return order
  const ordered = courseIds.map((id) => courses.find((c) => c.id === id)).filter((c): c is (typeof courses)[number] => !!c);

  return NextResponse.json({
    courses: ordered.map((c) => ({
      id: c.id, code: c.code, title: c.title,
      topics: c.seedTopics.map((t) => ({ id: t.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic })),
    })),
  });
}
