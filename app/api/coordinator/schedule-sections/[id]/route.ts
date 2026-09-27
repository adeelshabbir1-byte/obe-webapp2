import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// A section belongs to either a standalone course or an equivalence
// group — never both — so ownership has to be checked whichever way this
// one row goes, not just via section.course (which is null for a group
// section and would otherwise throw here).
async function ownsSection(section: { courseId: string | null; groupId: string | null }, coordinatorId: string): Promise<boolean> {
  if (section.courseId) {
    const course = await prisma.course.findUnique({ where: { id: section.courseId }, include: { batch: true } });
    return course?.batch?.coordinatorId === coordinatorId;
  }
  if (section.groupId) {
    const member = await prisma.courseEquivalenceMember.findFirst({
      where: { groupId: section.groupId, course: { batch: { coordinatorId } } },
    });
    return !!member;
  }
  return false;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id } });
  if (!section || !(await ownsSection(section, user.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.scheduleSection.update({
    where: { id: params.id },
    data: {
      sessionsPerWeek: body.sessionsPerWeek !== undefined ? parseInt(body.sessionsPerWeek, 10) : section.sessionsPerWeek,
      sessionDurationMinutes: body.sessionDurationMinutes !== undefined ? parseInt(body.sessionDurationMinutes, 10) : section.sessionDurationMinutes,
      roomTypeNeeded: body.roomTypeNeeded ?? section.roomTypeNeeded,
      sectionLabel: body.sectionLabel ?? section.sectionLabel,
    },
  });
  return NextResponse.json({ section: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id } });
  if (!section || !(await ownsSection(section, user.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.scheduleSection.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
