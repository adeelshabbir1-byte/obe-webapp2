import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.cLO.delete({ where: { id: params.cloId } });
  await writeAuditLog({ actorUserId: user.id, action: "CLO_DELETED", entityType: "CLO", entityId: params.cloId });

  return NextResponse.json({ ok: true });
}
