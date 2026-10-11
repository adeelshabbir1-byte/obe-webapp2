import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { reorderLectureContent } from "../../../../../../../lib/lectureReorder";

// Drag a lecture's content to another slot; the lectures in between shift by one. Dates stay with the slot.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await reorderLectureContent(course.id, "INSTRUCTOR", String(b.fromId || ""), String(b.toId || ""));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json({ rows: r.rows });
}
