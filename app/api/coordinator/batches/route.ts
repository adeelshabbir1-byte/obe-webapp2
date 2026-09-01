import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { _count: { select: { courses: true } } },
  });
  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.degreeProgram || !body.batchName || !body.startTerm || !body.startYear) {
    return NextResponse.json({ error: "degreeProgram, batchName, startTerm, startYear are required" }, { status: 400 });
  }
  if (!["Fall", "Spring"].includes(body.startTerm)) {
    return NextResponse.json({ error: "startTerm must be Fall or Spring" }, { status: 400 });
  }

  const existing = await prisma.batch.findFirst({
    where: { coordinatorId: user.id, degreeProgram: body.degreeProgram, batchName: body.batchName },
  });
  if (existing) return NextResponse.json({ error: "this degree program + batch already exists" }, { status: 409 });

  const batch = await prisma.batch.create({
    data: {
      coordinatorId: user.id, degreeProgram: body.degreeProgram, batchName: body.batchName,
      startTerm: body.startTerm, startYear: parseInt(body.startYear, 10),
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "BATCH_CREATED", entityType: "Batch", entityId: batch.id });

  return NextResponse.json({ batch }, { status: 201 });
}
