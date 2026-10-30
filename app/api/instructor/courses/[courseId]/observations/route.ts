import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { withErrors } from "../../../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  await prisma.course.update({ where: { id: course.id }, data: { instructorObservations: body.observations || null } });
  return NextResponse.json({ ok: true });
}
export const PUT = withErrors(PUT_handler);
