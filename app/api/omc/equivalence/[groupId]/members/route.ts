import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.courseEquivalenceGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.chairmanId !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const existing = await prisma.courseEquivalenceMember.findUnique({ where: { courseId: body.courseId } });
  if (existing) return NextResponse.json({ error: "this course is already in an equivalence group" }, { status: 409 });

  const member = await prisma.courseEquivalenceMember.create({ data: { groupId: params.groupId, courseId: body.courseId } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_MEMBER_ADDED", entityType: "CourseEquivalenceGroup", entityId: params.groupId, metadata: { courseId: body.courseId } });

  return NextResponse.json({ member }, { status: 201 });
}
