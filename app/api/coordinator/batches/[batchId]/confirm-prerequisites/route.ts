import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function PUT(req: Request, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.batch.update({ where: { id: params.batchId }, data: { prerequisitesConfirmedAt: new Date() } });
  return NextResponse.json({ prerequisitesConfirmedAt: updated.prerequisitesConfirmedAt });
}
