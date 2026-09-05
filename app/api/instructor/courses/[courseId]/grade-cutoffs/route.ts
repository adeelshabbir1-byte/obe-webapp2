import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const cutoffs: { letter: string; minPercent: number }[] = body.cutoffs || [];
  if (cutoffs.length === 0) return NextResponse.json({ error: "at least one cutoff is required" }, { status: 400 });

  for (const c of cutoffs) {
    await prisma.courseGradeCutoff.upsert({
      where: { courseId_letter: { courseId: course.id, letter: c.letter } },
      create: { courseId: course.id, letter: c.letter, minPercent: c.minPercent, setById: user.id },
      update: { minPercent: c.minPercent, setById: user.id },
    });
  }

  await writeAuditLog({ actorUserId: user.id, action: "GRADE_CUTOFFS_SET", entityType: "Course", entityId: course.id });

  const saved = await prisma.courseGradeCutoff.findMany({ where: { courseId: course.id } });
  return NextResponse.json({ cutoffs: saved });
}
