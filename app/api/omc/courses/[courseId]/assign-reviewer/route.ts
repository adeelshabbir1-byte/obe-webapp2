import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Must be an OMC member reporting to the same chairman as the
  // requester — never someone from a different institution.
  let reviewerId: string | null = null;
  if (body.reviewerId) {
    const reviewer = await prisma.user.findUnique({ where: { id: body.reviewerId } });
    if (!reviewer || reviewer.role !== "OMC" || reviewer.managedById !== user.managedById) {
      return NextResponse.json({ error: "invalid reviewer" }, { status: 400 });
    }
    reviewerId = reviewer.id;
  }

  await prisma.course.update({ where: { id: course.id }, data: { assignedOmcReviewerId: reviewerId } });
  await writeAuditLog({ actorUserId: user.id, action: "OMC_REVIEWER_ASSIGNED", entityType: "Course", entityId: course.id, metadata: { reviewerId: reviewerId || "none" } });

  return NextResponse.json({ ok: true, reviewerId });
}
