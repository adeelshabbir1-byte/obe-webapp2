import { programNotLicensed, instituteOfUser } from "../../../../lib/moduleLocks";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { deleteBatchCompletely } from "../../../../lib/deleteBatchCompletely";
import { autoCopyFromPreviousBatch } from "../../../../lib/autoCopyPreviousBatch";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
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

async function POST_handler(req: NextRequest) {
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

  { const inst = await instituteOfUser({ id: user.id, role: user.role, managedById: user.managedById ?? null }); const why = await programNotLicensed(inst, String(body.degreeProgram)); if (why) return NextResponse.json({ error: why }, { status: 403 }); }
  // Licensing check: an institution is only allowed as many DISTINCT degree
  // programs as its Institute Head has been licensed for. Scoped across every
  // Coordinator under the same Institute Head, since the license is per-institution.
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

  // GAs carry forward from the previous batch; courses do not — the Program Lead picks their source next.
  const copyResult = await autoCopyFromPreviousBatch(batch, { courses: false });
  await writeAuditLog({
    actorUserId: user.id, action: "BATCH_CREATED", entityType: "Batch", entityId: batch.id,
    metadata: { autoCopyFrom: copyResult.copiedFrom, autoCopyCourses: copyResult.coursesCopied, autoCopyPlos: copyResult.plosCopied },
  });

  return NextResponse.json({ batch, autoCopy: copyResult }, { status: 201 });
}

// Bulk delete — every batch this Coordinator owns. Requires an explicit
// confirmation phrase in the body as a server-side backstop, since the
// client-side confirmation alone shouldn't be the only thing standing
// between a stray request and wiping out the whole curriculum.
async function DELETE_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "DELETE ALL BATCHES") {
    return NextResponse.json({ error: "confirmation phrase did not match" }, { status: 400 });
  }

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { id: true, batchName: true } });
  let deleted = 0;
  const errors: string[] = [];

  for (const b of batches) {
    try {
      await deleteBatchCompletely(b.id);
      deleted++;
    } catch (err: any) {
      errors.push(`${b.batchName}: ${err?.message || "failed"}`);
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "ALL_BATCHES_DELETED", entityType: "Batch", entityId: "bulk", metadata: { deleted, errorCount: errors.length } });

  return NextResponse.json({ deleted, total: batches.length, errors: errors.length > 0 ? errors : undefined });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
export const DELETE = withErrors(DELETE_handler);
