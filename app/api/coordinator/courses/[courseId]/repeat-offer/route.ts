import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const offer = !!body.offer;

  const data: any = { isOffered: offer };
  if (offer) { data.offeredTermName = "Summer"; data.offeredTermYear = body.year ? parseInt(body.year, 10) : new Date().getFullYear(); }

  const updated = await prisma.course.update({ where: { id: course.id }, data });

  await writeAuditLog({ actorUserId: user.id, action: offer ? "COURSE_REPEAT_OFFERED" : "COURSE_REPEAT_UNOFFERED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
