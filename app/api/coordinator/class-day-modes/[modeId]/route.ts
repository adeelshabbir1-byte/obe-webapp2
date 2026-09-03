import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { modeId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mode = await prisma.classDayMode.findUnique({ where: { id: params.modeId } });
  if (!mode || mode.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.classDayMode.delete({ where: { id: params.modeId } });
  return NextResponse.json({ ok: true });
}
