import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clos = await prisma.cLO.findMany({ where: { courseId: course.id } });
  const lectureRows = await prisma.lectureRow.findMany({ where: { courseId: course.id } });
  if (clos.length === 0 || lectureRows.length === 0) {
    return NextResponse.json({ error: "add at least one CLO and one lecture row before submitting" }, { status: 400 });
  }

  // Each CLO must be covered by at least 3 lecture topics.
  const hitCounts: Record<string, number> = {};
  for (const c of clos) hitCounts[c.id] = 0;
  for (const r of lectureRows) if (r.cloId) hitCounts[r.cloId] = (hitCounts[r.cloId] || 0) + 1;
  const underCovered = clos.filter((c) => (hitCounts[c.id] || 0) < 3);
  if (underCovered.length > 0) {
    return NextResponse.json({
      error: `every CLO needs at least 3 lecture topics — still short: ${underCovered.map((c) => c.code).join(", ")}`,
    }, { status: 400 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { templateStatus: "submitted" } });
  await writeAuditLog({ actorUserId: user.id, action: "TEMPLATE_SUBMITTED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
