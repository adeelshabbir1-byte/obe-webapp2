import { NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../lib/templateLock";
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
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  if (!course.masterCourseId) {
    return NextResponse.json({ error: "this course wasn't adopted from a Master Curriculum, so there's no HEC starting content for it" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const overwrite = body?.overwrite === true;

  const existingClos = await prisma.cLO.count({ where: { courseId: course.id, source: "SE" } });
  if (existingClos > 0 && !overwrite) {
    return NextResponse.json({ error: "this course already has CLOs — loading starting content would risk duplicating or conflicting with your existing work. Add CLOs manually instead, or remove existing ones first if you really want a clean slate.", hasExistingClos: true }, { status: 400 });
  }

  if (existingClos > 0 && overwrite) {
    // Overwriting is only ever allowed before any real student marks exist —
    // the CLOs/lecture rows being replaced here don't hold marks themselves,
    // but wiping the lecture plan out from under an already-graded course
    // would silently break the weight/instrument linkage those grades relied
    // on to make sense.
    const gradedMarkCount = await prisma.studentMark.count({ where: { courseId: course.id } });
    if (gradedMarkCount > 0) {
      return NextResponse.json({ error: `This course already has ${gradedMarkCount} entered student mark(s). Overwriting the lecture plan would break its link to graded work, so this has been blocked.` }, { status: 409 });
    }
    // Clear the SE-authored CLOs and lecture plan (and any instrument links
    // hanging off those lecture rows) so the HEC seed starts from a clean
    // slate, same "replace" semantics as Import From Another Course.
    await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: course.id, source: "SE" } } });
    await prisma.lectureRow.deleteMany({ where: { courseId: course.id, source: "SE" } });
    await prisma.cLO.deleteMany({ where: { courseId: course.id, source: "SE" } });
  }

  const result = await seedFromMasterCourseIfAvailable(course.id, course.masterCourseId);
  if (!result) {
    return NextResponse.json({ error: "no HEC starting content exists for this specific course yet" }, { status: 404 });
  }

  await writeAuditLog({ actorUserId: user.id, action: "HEC_CONTENT_LOADED_RETROACTIVELY", entityType: "Course", entityId: course.id, metadata: result });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true, ...result });
}
