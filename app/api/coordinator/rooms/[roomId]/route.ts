import { NextResponse } from "next/server";
import { timetableActor, READ_ONLY } from "../../../../../lib/timetableAccess";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { withErrors } from "../../../../../lib/apiHandler";

async function DELETE_handler(req: Request, { params }: { params: { roomId: string } }) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;
  const chairmanId = await chairmanIdFor(user);

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room || room.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (await prisma.timetableEntry.count({ where: { roomId: params.roomId } })) return NextResponse.json({ error: "This room is used in a generated timetable, so it can't be removed. Generate a new timetable without it first." }, { status: 409 });
  await prisma.room.delete({ where: { id: params.roomId } });
  return NextResponse.json({ ok: true });
}
export const DELETE = withErrors(DELETE_handler);
