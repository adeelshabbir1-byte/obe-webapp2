import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      textbook: body.textbook || null, referenceMaterial: body.referenceMaterial || null,
      catalogDescription: body.catalogDescription || null, programmingAssignmentsNote: body.programmingAssignmentsNote || null,
      labInstructorName: body.labInstructorName || null,
      // NBEAC SAR: corporate relevance, indigenous focus and teaching methods (only when the form sends them).
      ...("corporateRelevance" in body ? { corporateRelevance: String(body.corporateRelevance || "").trim().slice(0, 2000) || null } : {}),
      ...("indigenousFocus" in body ? { indigenousFocus: String(body.indigenousFocus || "").trim().slice(0, 2000) || null } : {}),
      ...("teachingMethods" in body ? { teachingMethods: (Array.isArray(body.teachingMethods) ? body.teachingMethods.map(String) : String(body.teachingMethods || "").split(",")).map((x: string) => x.trim()).filter(Boolean).slice(0, 20).join(", ").slice(0, 500) || null } : {}),
    },
  });
  await syncCourseContentToLinkedCourses(course.id);
  return NextResponse.json({ course: updated });
}
