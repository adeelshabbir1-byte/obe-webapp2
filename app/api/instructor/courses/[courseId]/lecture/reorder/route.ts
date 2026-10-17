import { withLabSync } from "../../../../../../../lib/labSyncRoute";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { reorderLectureContent, applyLectureOrder } from "../../../../../../../lib/lectureReorder";

// Drag a lecture's content to another slot; the lectures in between shift by one. Dates stay with the slot.
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  // Either a whole new order (saved from the page's draft) or a single move.
  const r = Array.isArray(b.order)
    ? await applyLectureOrder(course.id, "INSTRUCTOR", (b.order as unknown[]).map(String))
    : await reorderLectureContent(course.id, "INSTRUCTOR", String(b.fromId || ""), String(b.toId || ""));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ rows: r.rows });
}

// A saved change to the lecture plan is checked against the course's lab plan; the instructor and Lab Engineer are told.
export const POST = withLabSync(POST_handler);
