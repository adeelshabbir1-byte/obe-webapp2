import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { ensureCoursePloMapping } from "../../../../../../../lib/coursePloSync";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.statement || !body.bloomLevel) return NextResponse.json({ error: "statement and bloomLevel are required" }, { status: 400 });

  const updated = await prisma.cLO.update({
    where: { id: params.cloId },
    data: {
      statement: body.statement, bloomLevel: body.bloomLevel,
      mappedPloId: body.mappedPloId || null, ploContributionPct: body.mappedPloId ? (body.ploContributionPct ? parseInt(body.ploContributionPct, 10) : 100) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_CLO_UPDATED", entityType: "CLO", entityId: params.cloId });
  if (body.mappedPloId) await ensureCoursePloMapping(course.id, body.mappedPloId, user.id, "MANUAL");
  return NextResponse.json({ clo: updated });
}

export async function DELETE(req: Request, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.cLO.delete({ where: { id: params.cloId } });
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_CLO_DELETED", entityType: "CLO", entityId: params.cloId });
  return NextResponse.json({ ok: true });
}
