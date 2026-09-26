import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { hashPassword } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";

// Uploads students for ANY of the Coordinator's own batches in one
// file — Name, Roll Number, Batch Name columns — rather than the
// existing per-batch upload's "pick one batch, then upload just that
// batch's names and roll numbers." Every row's batch name is checked
// against the Coordinator's own batches before anything is written:
// no match, or an ambiguous match (the same batch name existing under
// more than one degree program — technically possible since batches
// are only unique by coordinator+degreeProgram+batchName together),
// is reported back per-row rather than guessed at or silently
// skipped. Logins are activated automatically for every newly-created
// or newly-touched student in the same pass, using the same
// roll-number-as-initial-password bootstrap as the existing
// activate-logins endpoint — nobody who already has a password set is
// ever touched.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const csvText = formData.get("csvText") as string | null;
  if (!file && !csvText) return NextResponse.json({ error: "a file or pasted text is required" }, { status: 400 });

  type Row = { name: string; rollNumber: string; batchName: string };
  const rows: Row[] = [];

  try {
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith(".csv")) {
        for (const line of buffer.toString("utf-8").split(/\r?\n/)) {
          const parts = line.split(",").map((p) => p.trim());
          if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) rows.push({ name: parts[0], rollNumber: parts[1], batchName: parts[2] });
        }
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.worksheets[0];
        if (!sheet) return NextResponse.json({ error: "the uploaded file has no worksheet" }, { status: 400 });
        sheet.eachRow((row) => {
          const a = row.getCell(1).text?.trim();
          const b = row.getCell(2).text?.trim();
          const c = row.getCell(3).text?.trim();
          if (a && b && c) rows.push({ name: a, rollNumber: b, batchName: c });
        });
      }
    } else if (csvText) {
      for (const line of csvText.split(/\r?\n/)) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) rows.push({ name: parts[0], rollNumber: parts[1], batchName: parts[2] });
      }
    }
  } catch {
    return NextResponse.json({ error: "couldn't read that file — make sure it's a valid .xlsx or .csv" }, { status: 400 });
  }

  // Skip an obvious header row.
  const dataRows = rows.filter((r) => !(r.name.toLowerCase() === "name" && r.rollNumber.toLowerCase().includes("roll")));
  if (dataRows.length === 0) return NextResponse.json({ error: "no valid rows found — each line needs Name, Roll Number, and Batch Name" }, { status: 400 });

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
      rowErrors.push({ row: i + 1, ...r, reason: `no batch named "${r.batchName}" found among your batches — check spelling against the Batches page` });
      continue;
    }
    if (matches.length > 1) {
      const options = matches.map((m) => `${m.degreeProgram} — ${m.batchName}`).join(", ");
      rowErrors.push({ row: i + 1, ...r, reason: `"${r.batchName}" matches more than one batch (${options}) — this needs a more specific batch name` });
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
      rowErrors.push({ row: i + 1, ...r, reason: "couldn't save this row (unexpected database error)" });
    }
  }

  // Activate logins for everyone just touched who doesn't already have
  // a password set — same bootstrap-to-roll-number pattern as the
  // dedicated activate-logins endpoint, done here automatically so a
  // separate manual step isn't needed after every upload.
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
    metadata: { imported, activated, rowErrors: rowErrors.length, totalRows: dataRows.length },
  });

  return NextResponse.json({ imported, activated, rowErrors, totalRows: dataRows.length });
}
