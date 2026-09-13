import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";

export async function DELETE(req: Request, { params }: { params: { roomId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room || room.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.room.delete({ where: { id: params.roomId } });
  return NextResponse.json({ ok: true });
}
