import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { ensureInstructorCopy } from "../../../../../../lib/instructorCopy";
import { writeAuditLog } from "../../../../../../lib/audit";
import { ensureCoursePloMapping } from "../../../../../../lib/coursePloSync";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await ensureInstructorCopy(course.id);

  const body = await req.json();
  if (!body.code || !body.statement || !body.bloomLevel) {
    return NextResponse.json({ error: "code, statement, bloomLevel are required" }, { status: 400 });
  }

  const existing = await prisma.cLO.findFirst({ where: { courseId: course.id, source: "INSTRUCTOR", code: body.code } });
  if (existing) return NextResponse.json({ error: "a CLO with this code already exists" }, { status: 409 });

  const clo = await prisma.cLO.create({
    data: {
      courseId: course.id, source: "INSTRUCTOR", code: body.code, statement: body.statement, bloomLevel: body.bloomLevel,
      mappedPloId: body.mappedPloId || null, ploContributionPct: body.mappedPloId ? (body.ploContributionPct ? parseInt(body.ploContributionPct, 10) : 100) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_CLO_ADDED", entityType: "CLO", entityId: clo.id });
  if (body.mappedPloId) await ensureCoursePloMapping(course.id, body.mappedPloId, user.id);
  return NextResponse.json({ clo }, { status: 201 });
}
