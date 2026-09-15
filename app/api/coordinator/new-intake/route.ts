import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { autoCopyFromPreviousBatch } from "../../../../lib/autoCopyPreviousBatch";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { term, year, programIds } = body;
  if (!term || !year || !Array.isArray(programIds) || programIds.length === 0) {
    return NextResponse.json({ error: "term, year, and at least one selected program are required" }, { status: 400 });
  }
  if (!["Fall", "Spring"].includes(term)) return NextResponse.json({ error: "term must be Fall or Spring" }, { status: 400 });

  const programs = await prisma.degreeProgram.findMany({ where: { id: { in: programIds }, coordinatorId: user.id } });
  if (programs.length === 0) return NextResponse.json({ error: "no valid programs selected" }, { status: 400 });

  // Same institution-wide licensing check as single-batch creation.
  let maxDegreePrograms: number | null = null;
  let existingDistinctPrograms = new Set<string>();
  if (user.managedById) {
    const chairman = await prisma.user.findUnique({ where: { id: user.managedById } });
    if (chairman?.maxDegreePrograms !== null && chairman?.maxDegreePrograms !== undefined) {
      maxDegreePrograms = chairman.maxDegreePrograms;
      const coordinators = await prisma.user.findMany({ where: { managedById: user.managedById, role: "PROGRAM_COORDINATOR" } });
      const existingBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinators.map((c) => c.id) } } });
      existingDistinctPrograms = new Set(existingBatches.map((b) => b.degreeProgram));
    }
  }

  const created: { batchName: string; degreeProgram: string; copiedFrom: string | null; coursesCopied: number; plosCopied: number }[] = [];
  const skipped: { degreeProgram: string; reason: string }[] = [];

  for (const p of programs) {
    const batchName = `${p.shortCode} ${term} ${year}`;

    const dup = await prisma.batch.findFirst({ where: { coordinatorId: user.id, degreeProgram: p.name, batchName } });
    if (dup) { skipped.push({ degreeProgram: p.name, reason: "this intake already exists" }); continue; }

    if (maxDegreePrograms !== null && !existingDistinctPrograms.has(p.name) && existingDistinctPrograms.size >= maxDegreePrograms) {
      skipped.push({ degreeProgram: p.name, reason: `institution is licensed for only ${maxDegreePrograms} degree program(s)` });
      continue;
    }

    const batch = await prisma.batch.create({
      data: {
        coordinatorId: user.id, degreeProgram: p.name, batchName, startTerm: term, startYear: parseInt(year, 10),
        studentCount: p.defaultIntakeSize,
      },
    });
    existingDistinctPrograms.add(p.name);

    const copyResult = await autoCopyFromPreviousBatch(batch);
    created.push({
      batchName, degreeProgram: p.name,
      copiedFrom: copyResult.copiedFrom, coursesCopied: copyResult.coursesCopied, plosCopied: copyResult.plosCopied,
    });
    await writeAuditLog({
      actorUserId: user.id, action: "BATCH_CREATED", entityType: "Batch", entityId: batch.id,
      metadata: { autoCopyFrom: copyResult.copiedFrom, autoCopyCourses: copyResult.coursesCopied, autoCopyPlos: copyResult.plosCopied },
    });
  }

  return NextResponse.json({ created, skipped });
}
