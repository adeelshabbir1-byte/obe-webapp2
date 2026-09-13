import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id }, include: { course: { include: { batch: true } } } });
  if (!section || section.course.batch?.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

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

  const section = await prisma.scheduleSection.findUnique({ where: { id: params.id }, include: { course: { include: { batch: true } } } });
  if (!section || section.course.batch?.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.scheduleSection.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
