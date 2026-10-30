import { withLabSync } from "../../../../../../../lib/labSyncRoute";
import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { reorderLectureContent, applyLectureOrder } from "../../../../../../../lib/lectureReorder";
import { withErrors } from "../../../../../../../lib/apiHandler";

// Drag a lecture's content to another slot; the lectures in between shift by one.
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  // Either a whole new order (saved from the page's draft) or a single move.
  const r = Array.isArray(b.order)
    ? await applyLectureOrder(course.id, "SE", (b.order as unknown[]).map(String))
    : await reorderLectureContent(course.id, "SE", String(b.fromId || ""), String(b.toId || ""));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
  if (r.rows.length) {
    await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_MOVED", entityType: "LectureRow", entityId: String(b.fromId), metadata: { change: Array.isArray(b.order) ? "new order saved" : `moved to ${String(b.toId)}` } });
    await syncCourseContentToLinkedCourses(course.id);
  }
  return NextResponse.json({ rows: r.rows });
}

// A saved change to the lecture plan is checked against the course's lab plan; the instructor and Lab Engineer are told.
export const POST = withErrors(withLabSync(POST_handler));
