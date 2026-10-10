import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";

// Copies this course's content out to follower courses. The browser calls this in the background after a save,
// so the Subject Expert doesn't have to wait for the (slow) copy to finish.
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Only the base course pushes content out; a follower section must never overwrite the base.
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  await syncCourseContentToLinkedCourses(course.id);
  return NextResponse.json({ ok: true });
}
