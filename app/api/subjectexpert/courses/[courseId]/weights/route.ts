import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const fields = ["assignmentPct", "quizPct", "projectPct", "labPct", "midtermPct", "finalPct"];
  const vals: Record<string, number> = {};
  for (const f of fields) vals[f] = parseInt(body[f] ?? 0, 10) || 0;

  const total = fields.reduce((sum, f) => sum + vals[f], 0);
  if (total !== 100) {
    return NextResponse.json({ error: `weights must total 100%, currently ${total}%` }, { status: 400 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: vals });
  await writeAuditLog({ actorUserId: user.id, action: "WEIGHTS_UPDATED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
