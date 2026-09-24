import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function PUT(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const body = await req.json();
  let advisorId: string | null = null;
  if (body.advisorId) {
    const advisor = await prisma.user.findUnique({ where: { id: body.advisorId } });
    if (!advisor || !["INSTRUCTOR", "SUBJECT_EXPERT"].includes(advisor.role) || advisor.managedById !== user.id) {
      return NextResponse.json({ error: "invalid advisor" }, { status: 400 });
    }
    advisorId = advisor.id;
  }

  await prisma.batch.update({ where: { id: batch.id }, data: { advisorId } });
  return NextResponse.json({ ok: true, advisorId });
}
