import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    if (!body.batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

    const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
    if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

    const hecPlos = await prisma.masterPLO.findMany({
      where: { masterCurriculum: { authority: "HEC" } },
      orderBy: { number: "asc" },
    });

    // Multiple HEC-flagged curricula (one per degree program) can each
    // carry their own copy of the same PLO numbers — dedupe by number
    // (keeping the first one seen) before inserting, since PLO has a
    // unique (batchId, number) constraint and a duplicate would otherwise
    // crash the whole request uncaught.
    const seenNumbers = new Set<number>();
    const dedupedHecPlos = hecPlos.filter((h) => {
      if (seenNumbers.has(h.number)) return false;
      seenNumbers.add(h.number);
      return true;
    });

    const existingNumbers = new Set((await prisma.pLO.findMany({ where: { batchId: batch.id }, select: { number: true } })).map((p) => p.number));

    const toCreate = dedupedHecPlos.filter((h) => !existingNumbers.has(h.number));
    if (toCreate.length > 0) {
      await prisma.pLO.createMany({
        data: toCreate.map((h) => ({
          coordinatorId: user.id, batchId: batch.id, number: h.number, title: h.title, description: h.description, sourceMasterPloNumber: h.number,
        })),
      });
    }

    await writeAuditLog({ actorUserId: user.id, action: "PLOS_BULK_ADDED_HEC", entityType: "Batch", entityId: batch.id, metadata: { count: toCreate.length } });

    const createdPlos = toCreate.length > 0
      ? await prisma.pLO.findMany({ where: { batchId: batch.id, number: { in: toCreate.map((h) => h.number) } } })
      : [];
    return NextResponse.json({ created: toCreate.length, skipped: dedupedHecPlos.length - toCreate.length, plos: createdPlos });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong adding HEC PLOs" }, { status: 500 });
  }
}
