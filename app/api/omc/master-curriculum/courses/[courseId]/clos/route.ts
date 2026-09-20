import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.masterCourse.findUnique({ where: { id: params.courseId }, include: { masterCurriculum: true } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (course.masterCurriculum.chairmanId !== user.managedById) {
    return NextResponse.json({ error: "this belongs to the shared official reference copy (or another institution's own copy) — clone the curriculum first to make your own editable version" }, { status: 403 });
  }

  const body = await req.json();
  const { statement, bloomLevel } = body;
  if (!statement?.trim() || !bloomLevel) return NextResponse.json({ error: "statement and bloomLevel are required" }, { status: 400 });

  const maxOrder = await prisma.masterCourseClo.aggregate({ where: { masterCourseId: params.courseId }, _max: { orderIndex: true } });

  const clo = await prisma.masterCourseClo.create({
    data: { masterCourseId: params.courseId, statement: statement.trim(), bloomLevel, orderIndex: (maxOrder._max.orderIndex ?? -1) + 1 },
  });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_CLO_CREATED", entityType: "MasterCourseClo", entityId: clo.id, metadata: { statement } });

  return NextResponse.json({ clo });
}
