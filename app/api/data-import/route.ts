import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { readWorkbookGrids } from "../../../lib/excelRead";
import { parseCsv } from "../../../lib/lmsImport";
import { KINDS, kindOf, headerRow, autoMap, mappedRows, dryRun, commit, undo, IMPORT_HINT, type Ctx } from "../../../lib/dataImport";

const ALLOWED = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];

async function who() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED.includes(user.role)) return null;
  return { user, chairmanId: await chairmanIdFor(user) };
}

// GET ?template=<kind> — an Excel template: the columns, one example row, an Instructions sheet.
export async function GET(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const k = kindOf(req.nextUrl.searchParams.get("template") || "");
  if (!k) return NextResponse.json({ error: "unknown template" }, { status: 404 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(k.title.slice(0, 30).replace(/[\\/?*[\]:]/g, ""));
  const head = ws.addRow(k.fields.map((f) => f.label + (f.required ? " *" : "")));
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2A4A" } }; });
  ws.addRow(k.fields.map((f) => f.example)).font = { italic: true, color: { argb: "FF777777" } };
  k.fields.forEach((f, i) => { ws.getColumn(i + 1).width = Math.max(14, f.label.length + 6); });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const roleCol = k.fields.findIndex((f) => f.key === "role" || f.key === "type" || f.key === "termName");
  if (roleCol >= 0) {
    const list = k.fields[roleCol].key === "role" ? '"Instructor,Subject Expert"' : k.fields[roleCol].key === "type" ? '"Lecture,Lab"' : '"Fall,Spring,Summer"';
    for (let r = 2; r <= 3000; r++) ws.getCell(r, roleCol + 1).dataValidation = { type: "list", allowBlank: true, formulae: [list] };
  }
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 28; info.getColumn(2).width = 90;
  info.addRow([k.title]).font = { bold: true, size: 13 };
  info.addRow([k.what]);
  info.addRow(["Replace the grey example row with your data. Columns marked * are required. Rows that already exist are skipped, so you can upload the same file again."]);
  info.addRow(["You can also upload your own file with different headings — you match the columns after uploading."]);
  info.addRow([]);
  info.addRow(["Column", "What to put"]).font = { bold: true };
  for (const f of k.fields) info.addRow([f.label + (f.required ? " *" : ""), `${f.note || ""} Example: ${f.example}`.trim()]);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${k.title.replace(/[^\w ]+/g, "")} template.xlsx"` } });
}

// POST multipart { action: parse | dryrun | commit, kind, file, sheet, map (JSON), batchId, leadId }  or JSON { action: "undo", id }.
export async function POST(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Only heads, Program Leads and coordinators can import data." }, { status: 403 });
  const { user, chairmanId } = w;
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json();
      if (b.action !== "undo") return NextResponse.json({ error: "unknown action" }, { status: 400 });
      const r = await undo(chairmanId, user.id, String(b.id));
      return NextResponse.json({ ok: true, message: `Undone: ${r.removed} row(s) removed${r.kept ? `, ${r.kept} kept because other records now use them` : ""}.` });
    }
    const fd = await req.formData();
    const kind = kindOf(String(fd.get("kind") || ""));
    const file = fd.get("file") as File | null;
    if (!kind || !file) return NextResponse.json({ error: "Choose what you are importing and a file." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "The file is over 15 MB — split it." }, { status: 400 });
    const sheets = file.name.toLowerCase().endsWith(".csv") ? [{ name: "csv", grid: parseCsv(Buffer.from(await file.arrayBuffer()).toString("utf-8")) }] : await readWorkbookGrids(file);
    const si = Math.min(Math.max(0, Number(fd.get("sheet") || 0)), sheets.length - 1);
    const grid = sheets[si].grid;
    const hi = fd.get("headerRow") ? Math.max(0, Number(fd.get("headerRow")) - 1) : headerRow(grid, kind);
    const headers = (grid[hi] || []).map((h) => h || "");
    if (fd.get("action") === "parse") {
      return NextResponse.json({ sheets: sheets.map((s) => s.name), sheet: si, headerRow: hi + 1, headers, map: autoMap(headers, kind), sample: grid.slice(hi + 1, hi + 6), rows: grid.length - hi - 1 });
    }
    let map: Record<string, number> = {};
    try { map = JSON.parse(String(fd.get("map") || "{}")); } catch { map = {}; }
    let leadId = String(fd.get("leadId") || "") || undefined;
    const batchId = String(fd.get("batchId") || "") || undefined;
    if (user.role === "PROGRAM_COORDINATOR") {
      leadId = user.id;
      if (batchId && !(await prisma.batch.count({ where: { id: batchId, coordinatorId: user.id } }))) return NextResponse.json({ error: "Choose one of your own batches." }, { status: 403 });
    }
    const ctx: Ctx = { chairmanId, userId: user.id, target: { batchId, leadId } };
    const rows = mappedRows(grid, hi, map);
    if (!rows.length) return NextResponse.json({ error: "No data rows under the heading row." }, { status: 400 });
    if (rows.length > 20000) return NextResponse.json({ error: "Over 20,000 rows — split the file." }, { status: 400 });
    if (fd.get("action") === "dryrun") {
      const p = await dryRun(kind, rows, ctx, map);
      return NextResponse.json({ ok: true, rows: rows.length, ready: p.ok.length, skipped: p.skipped.slice(0, 300), skippedCount: p.skipped.length, errors: p.errors.slice(0, 300), errorCount: p.errors.length });
    }
    if (fd.get("action") === "commit") {
      const r = await commit(kind, file.name, rows, ctx, map);
      return NextResponse.json({ ok: true, message: `Imported ${r.created} row(s); ${r.skipped} skipped or with problems.`, ...r, errors: r.errors.slice(0, 300) });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /importLog|ImportLog/.test(m) ? IMPORT_HINT : m.slice(0, 400) }, { status: 400 });
  }
}

