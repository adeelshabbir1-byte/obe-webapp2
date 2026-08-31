import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.code || !body.statement || !body.bloomLevel) {
    return NextResponse.json({ error: "code, statement, bloomLevel are required" }, { status: 400 });
  }

  const existing = await prisma.cLO.findFirst({ where: { courseId: course.id, code: body.code } });
  if (existing) return NextResponse.json({ error: "a CLO with this code already exists on this course" }, { status: 409 });

  const clo = await prisma.cLO.create({
    data: {
      courseId: course.id, code: body.code, statement: body.statement, bloomLevel: body.bloomLevel,
      mappedPloId: body.mappedPloId || null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CLO_ADDED", entityType: "CLO", entityId: clo.id });

  return NextResponse.json({ clo }, { status: 201 });
}
