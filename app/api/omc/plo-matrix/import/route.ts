import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { syncCoursePloMappingToLinkedCourses } from "../../../../../lib/contentSync";

export const maxDuration = 60;

// Uploads a PLO-Course matrix in the layout Export produces. Every cell marked (X, x, 1, yes, a tick) adds that mapping.
// Blank cells are ignored: an upload never removes a mapping that is already set.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const batchId = String(form.get("batchId") || "");
  const file = form.get("file") as File | null;
  if (!batchId || !file) return NextResponse.json({ error: "choose a batch and a file" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { coordinator: { select: { managedById: true } } } });
  if (!batch || batch.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  let grid: string[][] = [];
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: "the file has no sheet" }, { status: 400 });
    ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); });
  } catch { return NextResponse.json({ error: "could not read that file — use the Excel file from Export" }, { status: 400 }); }

  const headerIdx = grid.findIndex((r) => r.some((c) => /^PLO\D*\d+$/i.test(c || "")));
  if (headerIdx < 0) return NextResponse.json({ error: "no PLO-1, PLO-2 … column headings found" }, { status: 400 });
  const header = grid[headerIdx];
  const ploCols: { col: number; number: number }[] = [];
  header.forEach((h, i) => { const m = /^PLO\D*(\d+)$/i.exec(h || ""); if (m) ploCols.push({ col: i, number: parseInt(m[1], 10) }); });
  const codeCol = Math.max(0, header.findIndex((h) => /code/i.test(h || "")));

  const [plos, courses] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId } }),
    prisma.course.findMany({ where: { batchId }, include: { ploMappings: true } }),
  ]);
  const ploByNumber = new Map(plos.map((p) => [p.number, p]));
  const courseByCode = new Map(courses.map((c) => [c.code.trim().toUpperCase(), c]));

  const yes = (v: string) => !!v && !/^(0|no|n|false|-)$/i.test(v);
  let added = 0, already = 0;
  const errors: string[] = [];
  for (const row of grid.slice(headerIdx + 1)) {
    const code = (row[codeCol] || "").trim().toUpperCase();
    if (!code) continue;
    const course = courseByCode.get(code);
    if (!course) { errors.push(`Course ${code} is not in this batch`); continue; }
    const have = new Set(course.ploMappings.map((m) => m.ploId));
    for (const { col, number } of ploCols) {
      if (!yes(row[col] || "")) continue;
      const plo = ploByNumber.get(number);
      if (!plo) { errors.push(`PLO-${number} does not exist in this batch`); continue; }
      if (have.has(plo.id)) { already++; continue; }
      await prisma.coursePloMapping.upsert({ where: { courseId_ploId: { courseId: course.id, ploId: plo.id } }, create: { courseId: course.id, ploId: plo.id, assignedById: user.id, source: "MANUAL" }, update: {} });
      await syncCoursePloMappingToLinkedCourses(course.id, plo.number, true, user.id);
      added++;
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "PLO_MATRIX_IMPORTED", entityType: "Batch", entityId: batch.id, metadata: { added, already, errors: errors.length } });
  return NextResponse.json({ added, already, errors: Array.from(new Set(errors)).slice(0, 20) });
}
