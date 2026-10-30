import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { blockedAsNonBaseCourse } from "../../../../../../../lib/contentSync";
import { handleDirect } from "../../../../../../../lib/directRouteHandler";
import { withErrors } from "../../../../../../../lib/apiHandler";

// Project / Lab: map to a CLO directly, or split into parts (one per CLO).
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const res = await handleDirect(course.id, "SE", user.id, await req.json().catch(() => ({})));
  return res;
}
export const POST = withErrors(POST_handler);
