import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scale = await prisma.gradingScale.findMany({ where: { coordinatorId: user.id }, orderBy: { orderIndex: "asc" } });
  return NextResponse.json({ scale });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.letter || body.gpaValue === undefined) return NextResponse.json({ error: "letter and gpaValue are required" }, { status: 400 });

  const count = await prisma.gradingScale.count({ where: { coordinatorId: user.id } });
  const entry = await prisma.gradingScale.upsert({
    where: { coordinatorId_letter: { coordinatorId: user.id, letter: body.letter } },
    create: { coordinatorId: user.id, letter: body.letter, gpaValue: parseFloat(body.gpaValue), orderIndex: body.orderIndex ?? count },
    update: { gpaValue: parseFloat(body.gpaValue) },
  });

  await writeAuditLog({ actorUserId: user.id, action: "GRADING_SCALE_ENTRY_SET", entityType: "GradingScale", entityId: entry.id });
  return NextResponse.json({ entry }, { status: 201 });
}
