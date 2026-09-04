import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.batchId || !body.csvText) return NextResponse.json({ error: "batchId and csvText are required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  // Expected format: one student per line, "Name, RollNumber" (comma or tab separated).
  // A header row containing "roll" is skipped automatically.
  const lines: string[] = body.csvText.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    if (parts.length < 2) { skipped++; continue; }
    const [name, rollNumber] = parts;
    if (!name || !rollNumber) { skipped++; continue; }
    if (name.toLowerCase() === "name" && rollNumber.toLowerCase().includes("roll")) { skipped++; continue; } // header row

    try {
      await prisma.student.upsert({
        where: { batchId_rollNumber: { batchId: batch.id, rollNumber } },
        create: { batchId: batch.id, name, rollNumber },
        update: { name },
      });
      imported++;
    } catch (err: any) {
      errors.push(`${rollNumber}: ${err?.message || "failed"}`);
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "STUDENTS_IMPORTED", entityType: "Batch", entityId: batch.id, metadata: { imported, skipped } });

  return NextResponse.json({ imported, skipped, errors: errors.length > 0 ? errors : undefined });
}
