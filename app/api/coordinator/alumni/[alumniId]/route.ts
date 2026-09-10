import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { alumniId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const alum = await prisma.alumni.findUnique({ where: { id: params.alumniId } });
  if (!alum || alum.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.alumni.delete({ where: { id: params.alumniId } });
  return NextResponse.json({ ok: true });
}
