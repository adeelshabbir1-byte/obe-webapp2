import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { reorderLectureContent } from "../../../../../../../lib/lectureReorder";

// Drag a lecture's content to another slot; the lectures in between shift by one.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const r = await reorderLectureContent(course.id, "SE", String(b.fromId || ""), String(b.toId || ""));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
  if (r.rows.length) {
    await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_MOVED", entityType: "LectureRow", entityId: String(b.fromId), metadata: { toId: String(b.toId) } });
    await syncCourseContentToLinkedCourses(course.id);
  }
  return NextResponse.json({ rows: r.rows });
}
