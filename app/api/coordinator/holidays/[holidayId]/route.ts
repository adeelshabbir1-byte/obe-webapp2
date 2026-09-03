import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { holidayId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const holiday = await prisma.holiday.findUnique({ where: { id: params.holidayId } });
  if (!holiday || holiday.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.holiday.delete({ where: { id: params.holidayId } });
  return NextResponse.json({ ok: true });
}
