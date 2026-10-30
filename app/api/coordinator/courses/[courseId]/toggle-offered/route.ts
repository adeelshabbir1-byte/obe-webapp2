import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { withErrors } from "../../../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const isOffered = !!body.isOffered;
  if (isOffered) { const why = await (await import("../../../../../../lib/batchFlow")).offerBlock(course.batchId); if (why) return NextResponse.json({ error: why }, { status: 409 }); }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { isOffered } });

  await writeAuditLog({
    actorUserId: user.id, action: isOffered ? "COURSE_MANUALLY_OFFERED" : "COURSE_UNOFFERED",
    entityType: "Course", entityId: course.id,
  });

  return NextResponse.json({ course: updated });
}
export const PUT = withErrors(PUT_handler);
