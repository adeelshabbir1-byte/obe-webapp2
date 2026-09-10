import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { employerId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const employer = await prisma.employer.findUnique({ where: { id: params.employerId } });
  if (!employer || employer.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.employer.delete({ where: { id: params.employerId } });
  return NextResponse.json({ ok: true });
}
