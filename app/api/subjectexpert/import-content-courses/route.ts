import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { requireOwnedCourse } from "../../../../lib/subjectExpertGuard";

// Lists candidate SOURCE courses for a Subject Expert's "Import from
// another course" action on a specific target course — restricted to
// courses OMC has actually marked as equivalent to it (the same real
// class, offered again or run in parallel), via the Course Equivalence
// Matrix. This used to list every course in the institution with any
// CLOs at all, which made it easy to pull in content from an unrelated
// course by mistake; equivalence is the institution's own, deliberate
// statement that two courses really are the same thing, so it's the
// right (and only) scope for this.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUBJECT_EXPERT") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  const target = await requireOwnedCourse(user, courseId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const membership = await prisma.courseEquivalenceMember.findUnique({
    where: { courseId },
    include: { group: { include: { members: { include: { course: { include: { batch: true, _count: { select: { clos: true } } } } } } } } },
  });
  if (!membership) return NextResponse.json({ courses: [], noEquivalenceGroup: true });

  const courses = membership.group.members
    .filter((m) => m.courseId !== courseId && m.course._count.clos > 0) // no point listing an empty course, or the course itself
    .map((m) => ({ id: m.course.id, code: m.course.code, title: m.course.title, degreeProgram: m.course.batch?.degreeProgram || "", batchName: m.course.batch?.batchName || "" }));

  return NextResponse.json({ courses, noEquivalenceGroup: false });
}
