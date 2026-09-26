import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";

// Processes one chunk of already-parsed rows (see the sibling /parse
// endpoint, which does the file reading up front) — the database work
// here (batch lookup, upsert, login activation) is the slow part, so
// the client sends rows in small batches and calls this repeatedly
// rather than one request trying to process everything a large file
// might contain and risking a serverless timeout.
//
// Every row's batch name is checked against the Coordinator's own
// batches before anything is written: no match, or an ambiguous match
// (the same batch name existing under more than one degree program —
// technically possible since batches are only unique by
// coordinator+degreeProgram+batchName together), is reported back
// per-row rather than guessed at or silently skipped. Logins are
// activated automatically for every newly-created or newly-touched
// student in the same pass, using the same roll-number-as-initial-
// password bootstrap as the existing activate-logins endpoint —
// nobody who already has a password set is ever touched.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const dataRows: { name: string; rollNumber: string; batchName: string }[] = Array.isArray(body?.rows) ? body.rows : [];
  const rowOffset: number = typeof body?.rowOffset === "number" ? body.rowOffset : 0;
  if (dataRows.length === 0) return NextResponse.json({ error: "no rows to process" }, { status: 400 });

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id } });
  const byName = new Map<string, typeof batches>();
  for (const b of batches) {
    const key = b.batchName.trim().toLowerCase();
    const list = byName.get(key) || [];
    list.push(b);
    byName.set(key, list);
  }

  let imported = 0;
  let activated = 0;
  const rowErrors: { row: number; name: string; rollNumber: string; batchName: string; reason: string }[] = [];
  const touchedStudentIds: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const matches = byName.get(r.batchName.trim().toLowerCase()) || [];
    if (matches.length === 0) {
      rowErrors.push({ row: rowOffset + i + 1, ...r, reason: `no batch named "${r.batchName}" found among your batches — check spelling against the Batches page` });
      continue;
    }
    if (matches.length > 1) {
      const options = matches.map((m) => `${m.degreeProgram} — ${m.batchName}`).join(", ");
      rowErrors.push({ row: rowOffset + i + 1, ...r, reason: `"${r.batchName}" matches more than one batch (${options}) — this needs a more specific batch name` });
      continue;
    }

    const batch = matches[0];
    try {
      const student = await prisma.student.upsert({
        where: { batchId_rollNumber: { batchId: batch.id, rollNumber: r.rollNumber } },
        create: { batchId: batch.id, name: r.name, rollNumber: r.rollNumber },
        update: { name: r.name },
      });
      imported++;
      touchedStudentIds.push(student.id);
    } catch {
      rowErrors.push({ row: rowOffset + i + 1, ...r, reason: "couldn't save this row (unexpected database error)" });
    }
  }

  if (touchedStudentIds.length > 0) {
    const toActivate = await prisma.student.findMany({ where: { id: { in: touchedStudentIds }, passwordHash: null } });
    for (const s of toActivate) {
      const hash = await hashPassword(s.rollNumber);
      await prisma.student.update({ where: { id: s.id }, data: { passwordHash: hash, mustChangePassword: true } });
      activated++;
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: "STUDENTS_IMPORTED_MULTI_BATCH",
    metadata: { imported, activated, rowErrors: rowErrors.length, chunkSize: dataRows.length },
  });

  return NextResponse.json({ imported, activated, rowErrors });
}
