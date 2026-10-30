import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { previewPloChange } from "../../../../../../lib/ploDelta";
import { withErrors } from "../../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET: how the batch's PLO attainment would change if this course's result were approved now.
async function GET_handler(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ deltas: await previewPloChange(course.id) });
}
export const GET = withErrors(GET_handler);
