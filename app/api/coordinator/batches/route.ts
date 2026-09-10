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

  // Licensing check: an institution is only allowed as many DISTINCT degree
  // programs as its Chairman has been licensed for. Scoped across every
  // Coordinator under the same Chairman, since the license is per-institution.
  if (user.managedById) {
    const chairman = await prisma.user.findUnique({ where: { id: user.managedById } });
    if (chairman?.maxDegreePrograms !== null && chairman?.maxDegreePrograms !== undefined) {
      const coordinators = await prisma.user.findMany({ where: { managedById: user.managedById, role: "PROGRAM_COORDINATOR" } });
      const existingBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinators.map((c) => c.id) } } });
      const distinctPrograms = new Set(existingBatches.map((b) => b.degreeProgram));
      if (!distinctPrograms.has(body.degreeProgram) && distinctPrograms.size >= chairman.maxDegreePrograms) {
        return NextResponse.json({ error: `Your institution is licensed for ${chairman.maxDegreePrograms} degree program(s). Contact the platform administrator to add more.` }, { status: 403 });
      }
    }
  }

  const batch = await prisma.batch.create({
    data: {
      coordinatorId: user.id, degreeProgram: body.degreeProgram, batchName: body.batchName,
      startTerm: body.startTerm, startYear: parseInt(body.startYear, 10),
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "BATCH_CREATED", entityType: "Batch", entityId: batch.id });

  return NextResponse.json({ batch }, { status: 201 });
}
