import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const record = await prisma.facultyUnavailability.findUnique({ where: { id: params.id }, include: { faculty: true } });
  if (!record || record.faculty.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.facultyUnavailability.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
