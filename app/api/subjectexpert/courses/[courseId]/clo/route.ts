import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.statement || !body.bloomLevel) {
    return NextResponse.json({ error: "statement and bloomLevel are required" }, { status: 400 });
  }

  const count = await prisma.cLO.count({ where: { courseId: course.id, source: "SE" } });

  const clo = await prisma.cLO.create({
    data: {
      courseId: course.id, source: "SE", code: `CLO-${count + 1}`, orderIndex: count, statement: body.statement, bloomLevel: body.bloomLevel,
      mappedPloId: body.mappedPloId || null,
      ploContributionPct: body.mappedPloId ? (body.ploContributionPct ? parseInt(body.ploContributionPct, 10) : 100) : null,
      targetPct: body.targetPct ? parseInt(body.targetPct, 10) : 60,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CLO_ADDED", entityType: "CLO", entityId: clo.id });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ clo }, { status: 201 });
}
