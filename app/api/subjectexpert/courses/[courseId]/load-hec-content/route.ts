import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";
import { seedFromMasterCourseIfAvailable } from "../../../../../../lib/benchmarkCopy";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  if (!course.masterCourseId) {
    return NextResponse.json({ error: "this course wasn't adopted from a Master Curriculum, so there's no HEC starting content for it" }, { status: 400 });
  }

  const existingClos = await prisma.cLO.count({ where: { courseId: course.id, source: "SE" } });
  if (existingClos > 0) {
    return NextResponse.json({ error: "this course already has CLOs — loading starting content would risk duplicating or conflicting with your existing work. Add CLOs manually instead, or remove existing ones first if you really want a clean slate." }, { status: 400 });
  }

  const result = await seedFromMasterCourseIfAvailable(course.id, course.masterCourseId);
  if (!result) {
    return NextResponse.json({ error: "no HEC starting content exists for this specific course yet" }, { status: 404 });
  }

  await writeAuditLog({ actorUserId: user.id, action: "HEC_CONTENT_LOADED_RETROACTIVELY", entityType: "Course", entityId: course.id, metadata: result });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true, ...result });
}
