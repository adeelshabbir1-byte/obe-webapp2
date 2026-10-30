import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { resultLockMessage } from "../../../../../../../lib/resultApproval";
import { handleDirect } from "../../../../../../../lib/directRouteHandler";
import { withErrors } from "../../../../../../../lib/apiHandler";

// Project / Lab: map to a CLO directly, or split into parts (one per CLO, also from the rubric's criteria).
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  { const locked = await resultLockMessage(course.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }
  return handleDirect(course.id, "INSTRUCTOR", user.id, await req.json().catch(() => ({})));
}
export const POST = withErrors(POST_handler);
