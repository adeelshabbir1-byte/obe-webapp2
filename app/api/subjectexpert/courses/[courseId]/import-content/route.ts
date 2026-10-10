import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";
import { copyCourseContent } from "../../../../../../lib/benchmarkCopy";
import { findOwningChairmanId } from "../../../../../../lib/institutionCurriculum";
import { writeAuditLog } from "../../../../../../lib/audit";

// Lets a Subject Expert pull CLOs/PLO mappings/lecture plan/assessment
// instruments in from another course OMC has marked as equivalent to
// this one — the same real class, run again or run in parallel —
// instead of starting from scratch every time. This is the SE-facing
// counterpart to /api/omc/courses/import-content (OMC/Institute Head's
// version), scoped down to: target must be a course this SE actually
// owns, source must be equivalent to it (same institution is implied by
// that), and a course that inherits its content via Content Sync can't
// be overwritten directly (same guard every other SE content-mutation
// endpoint uses).
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locked = templateLockResponse(course); if (locked) return locked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  const sourceCourseId = body.sourceCourseId;
  if (!sourceCourseId) return NextResponse.json({ error: "sourceCourseId is required" }, { status: 400 });
  if (sourceCourseId === course.id) return NextResponse.json({ error: "Source and target can't be the same course." }, { status: 400 });

  const sourceCourse = await prisma.course.findUnique({ where: { id: sourceCourseId } });
  if (!sourceCourse) return NextResponse.json({ error: "source course not found" }, { status: 404 });

  // Same-institution check — never let an SE pull content in from a
  // course outside their own chairman's institution, even if they
  // somehow know its id.
  const [myChairmanId, sourceChairmanId] = await Promise.all([
    findOwningChairmanId(user.id),
    findOwningChairmanId(sourceCourse.coordinatorId),
  ]);
  if (!myChairmanId || myChairmanId !== sourceChairmanId) {
    return NextResponse.json({ error: "that course doesn't belong to your institution" }, { status: 403 });
  }

  // Source must actually be equivalent to the target — OMC's own
  // statement that these are the same real class — not just any course
  // in the institution. Matches the scope the "Copy FROM" list itself
  // is restricted to.
  const targetMembership = await prisma.courseEquivalenceMember.findUnique({ where: { courseId: course.id } });
  const sourceInSameGroup = targetMembership
    ? await prisma.courseEquivalenceMember.findFirst({ where: { courseId: sourceCourseId, groupId: targetMembership.groupId } })
    : null;
  if (!sourceInSameGroup) {
    return NextResponse.json({ error: "That course isn't marked equivalent to this one — only equivalent courses (set up by OMC on the Course Equivalence Matrix) can be imported from." }, { status: 403 });
  }

  // Same protection the OMC version has: never silently wipe out real,
  // entered grades on the target.
  const gradedMarkCount = await prisma.studentMark.count({ where: { courseId: course.id } });
  if (gradedMarkCount > 0) {
    return NextResponse.json({ error: `This course already has ${gradedMarkCount} entered student mark(s). Importing would delete graded work, so this has been blocked.` }, { status: 409 });
  }

  // Clear the target's existing content, dependency-ordered, before the
  // clean copy — same "replace" semantics as the OMC version.
  await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: course.id } } });
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: course.id } });
  await prisma.lectureRow.deleteMany({ where: { courseId: course.id } });
  await prisma.assessmentInstrument.deleteMany({ where: { courseId: course.id } });
  await prisma.cLO.deleteMany({ where: { courseId: course.id } });
  await prisma.coursePloMapping.deleteMany({ where: { courseId: course.id } });

  const result = await copyCourseContent(sourceCourseId, course.id);
  if (!result) return NextResponse.json({ error: "source course not found" }, { status: 404 });

  await writeAuditLog({ actorUserId: user.id, action: "SE_IMPORTED_COURSE_CONTENT", entityType: "Course", entityId: course.id, metadata: { sourceCourseId, ...result } });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true, ...result });
}
