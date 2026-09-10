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

  const newCourse = await prisma.course.findUnique({ where: { id: body.courseId } });
  if (!newCourse) return NextResponse.json({ error: "course not found" }, { status: 404 });

  // A group only makes sense if every member is actually taught in the same
  // real class, at the same time — so every course in it must share the
  // same offered term, not just the same course code/semester number.
  const currentMembers = await prisma.courseEquivalenceMember.findMany({ where: { groupId: params.groupId }, include: { course: true } });
  if (currentMembers.length > 0) {
    const existingTerm = currentMembers[0].course.offeredTermName;
    const existingYear = currentMembers[0].course.offeredTermYear;
    if (newCourse.offeredTermName !== existingTerm || newCourse.offeredTermYear !== existingYear) {
      return NextResponse.json({
        error: `this group is offered in ${existingTerm} ${existingYear} — "${newCourse.code}" is offered in ${newCourse.offeredTermName || "an unset term"} ${newCourse.offeredTermYear || ""}, so it can't be merged into the same class`,
      }, { status: 400 });
    }
  }

  const member = await prisma.courseEquivalenceMember.create({ data: { groupId: params.groupId, courseId: body.courseId } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_MEMBER_ADDED", entityType: "CourseEquivalenceGroup", entityId: params.groupId, metadata: { courseId: body.courseId } });

  return NextResponse.json({ member }, { status: 201 });
}
