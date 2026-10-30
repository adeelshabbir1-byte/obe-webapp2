import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { refreshInstructorCopy } from "../../../../../../lib/instructorCopy";
import { writeAuditLog } from "../../../../../../lib/audit";
import { withErrors } from "../../../../../../lib/apiHandler";

// POST: replace the Instructor's copy with a fresh copy of the SE plan (only before teaching starts).
async function POST_handler(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const err = await refreshInstructorCopy(course.id);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_PLAN_REFRESHED", entityType: "Course", entityId: course.id }).catch(() => null);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
