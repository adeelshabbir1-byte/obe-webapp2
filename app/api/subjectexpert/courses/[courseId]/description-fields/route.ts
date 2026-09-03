import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      textbook: body.textbook || null, referenceMaterial: body.referenceMaterial || null,
      catalogDescription: body.catalogDescription || null, programmingAssignmentsNote: body.programmingAssignmentsNote || null,
      labInstructorName: body.labInstructorName || null,
    },
  });
  return NextResponse.json({ course: updated });
}
