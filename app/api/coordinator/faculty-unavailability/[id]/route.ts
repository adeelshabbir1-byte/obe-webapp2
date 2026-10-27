import { NextResponse } from "next/server";
import { timetableActor, READ_ONLY, scopeFaculty } from "../../../../../lib/timetableAccess";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;

  const record = await prisma.facultyUnavailability.findUnique({ where: { id: params.id }, include: { faculty: true } });
  if (!record || !(await scopeFaculty(actor.scope)).some((f) => f.id === record.facultyId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.facultyUnavailability.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
