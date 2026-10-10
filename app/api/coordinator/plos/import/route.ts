import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export const maxDuration = 60;

// Uploads PLOs for one batch from an Excel/CSV file with the headings # (number), Title and Description
// (the Export layout works as is). PLO numbers that already exist are left untouched; only new ones are added.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const batchId = String(form.get("batchId") || "");
  const file = form.get("file") as File | null;
  if (!batchId || !file) return NextResponse.json({ error: "choose a batch and a file" }, { status: 400 });
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const grid: string[][] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".csv")) {
      for (const l of buf.toString("utf-8").split(/\r?\n/)) grid.push(l.split(",").map((x) => x.trim()));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0];
      if (!ws) return NextResponse.json({ error: "the file has no sheet" }, { status: 400 });
      ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); });
    }
  } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  const hi = grid.findIndex((r) => r.some((c) => /^title$/i.test(c || "")) && r.some((c) => /^description$/i.test(c || "")));
  if (hi < 0) return NextResponse.json({ error: "no heading row with Title and Description found" }, { status: 400 });
  const find = (re: RegExp) => grid[hi].findIndex((c) => re.test(c || ""));
  const col = { n: find(/^(#|no\.?|number|plo)$/i), title: find(/^title$/i), desc: find(/^description$/i) };
  if (col.n < 0) return NextResponse.json({ error: "a # (number) column is needed" }, { status: 400 });

  const existing = new Set((await prisma.pLO.findMany({ where: { batchId }, select: { number: true } })).map((p) => p.number));
  let added = 0, skipped = 0;
  const errors: string[] = [];
  for (const r of grid.slice(hi + 1)) {
    if (!r.some((c) => c)) continue;
    const number = parseInt(String(r[col.n] || "").replace(/\D+/g, ""), 10);
    const title = r[col.title], description = r[col.desc];
    if (!Number.isFinite(number) || !title || !description) { errors.push(`Skipped a row (needs number, title and description): ${r.join(" | ").slice(0, 60)}`); continue; }
    if (existing.has(number)) { skipped++; continue; }
    await prisma.pLO.create({ data: { coordinatorId: user.id, batchId, number, title, description } });
    existing.add(number); added++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "PLOS_IMPORTED_FROM_FILE", entityType: "Batch", entityId: batchId, metadata: { added, skipped } });
  return NextResponse.json({ added, skipped, errors: errors.slice(0, 10) });
}
