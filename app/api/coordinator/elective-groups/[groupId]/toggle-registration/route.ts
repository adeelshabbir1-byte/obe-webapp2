import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function PUT(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const group = await prisma.electiveSlotGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (group.finalized) return NextResponse.json({ error: "already finalized" }, { status: 400 });

  const updated = await prisma.electiveSlotGroup.update({ where: { id: group.id }, data: { registrationOpen: !!body.open } });
  return NextResponse.json({ registrationOpen: updated.registrationOpen });
}
