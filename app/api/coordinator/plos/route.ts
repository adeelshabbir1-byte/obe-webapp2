import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const batchId = req.nextUrl.searchParams.get("batchId");
  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) },
    orderBy: [{ batchId: "asc" }, { number: "asc" }],
  });
  return NextResponse.json({ plos });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.number || !body.title || !body.description || !body.batchId) {
    return NextResponse.json({ error: "number, title, description, batchId are required" }, { status: 400 });
  }

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const existing = await prisma.pLO.findFirst({ where: { batchId: body.batchId, number: parseInt(body.number, 10) } });
  if (existing) return NextResponse.json({ error: "a PLO with this number already exists for this batch" }, { status: 409 });

  const plo = await prisma.pLO.create({
    data: {
      coordinatorId: user.id,
      batchId: body.batchId,
      number: parseInt(body.number, 10),
      title: body.title,
      description: body.description,
      sourceMasterPloNumber: body.sourceMasterPloNumber ? parseInt(body.sourceMasterPloNumber, 10) : null,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "PLO_CREATED", entityType: "PLO", entityId: plo.id });

  return NextResponse.json({ plo }, { status: 201 });
}
