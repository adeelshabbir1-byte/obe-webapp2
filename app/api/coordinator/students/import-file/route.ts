import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const batchId = formData.get("batchId") as string | null;
  const file = formData.get("file") as File | null;
  if (!batchId || !file) return NextResponse.json({ error: "batchId and file are required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows: { name: string; rollNumber: string }[] = [];

  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = buffer.toString("utf-8");
      for (const line of text.split(/\r?\n/)) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) rows.push({ name: parts[0], rollNumber: parts[1] });
      }
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) return NextResponse.json({ error: "the uploaded file has no worksheet" }, { status: 400 });

      sheet.eachRow((row) => {
        const cellA = row.getCell(1).text?.trim();
        const cellB = row.getCell(2).text?.trim();
        if (cellA && cellB) rows.push({ name: cellA, rollNumber: cellB });
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "couldn't read that file — make sure it's a valid .xlsx or .csv" }, { status: 400 });
  }

  // Skip an obvious header row (e.g. "Name" / "Roll Number").
  const dataRows = rows.filter((r) => !(r.name.toLowerCase() === "name" && r.rollNumber.toLowerCase().includes("roll")));

  let imported = 0, skipped = 0;
  for (const r of dataRows) {
    try {
      await prisma.student.upsert({
        where: { batchId_rollNumber: { batchId: batch.id, rollNumber: r.rollNumber } },
        create: { batchId: batch.id, name: r.name, rollNumber: r.rollNumber },
        update: { name: r.name },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "STUDENTS_IMPORTED_FROM_FILE", entityType: "Batch", entityId: batch.id, metadata: { imported, skipped, filename: file.name } });

  const freshStudents = await prisma.student.findMany({ where: { batchId: batch.id }, orderBy: { rollNumber: "asc" } });
  return NextResponse.json({ imported, skipped, students: freshStudents.map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })) });
}
