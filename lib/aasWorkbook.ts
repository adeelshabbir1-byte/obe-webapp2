import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { SECTIONS, sectionOf, sectionRows, storeKey, systemRows, adb, problemOf, saveDetail } from "./aas";
import { prisma } from "./db";

type Ctx = { chairmanId: string; program: string; batchId: string | null; focalId: string };
const REF = "OBEHUB ref (do not change)";

/** The whole AAS as one workbook: a sheet per AAS section with NCEAC's field names, filled from OBEHUB. */
export async function aasWorkbook(ctx: Ctx, only?: string) {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet("Read me");
  info.getColumn(1).width = 120;
  [["NCEAC AAS data from OBEHUB", true], [`Program: ${ctx.program || "all"}`, false], ["Each sheet is one AAS section, with NCEAC's field names in the same order as the AAS forms.", false], ["Yellow cells are compulsory in AAS and still empty. Fill them here and upload this file back on OBEHUB's NCEAC AAS page, or type them straight into AAS.", false], ["Keep the first column (OBEHUB ref) as it is. To add a row that OBEHUB does not know (e.g. an older financial year), leave its ref empty.", false], ["Dates as dd/mm/yyyy. CNIC as xxxxx-xxxxxxx-x. Yes / No answers as Yes or No.", false], ["Student Directory: use the separate 'Student Directory (AAS upload)' file for AAS's Excel upload.", false]].forEach(([t, b]) => { const r = info.addRow([t]); if (b) r.font = { bold: true, size: 14 }; });
  for (const s of SECTIONS.filter((x) => !only || x.key === only)) {
    const ws = wb.addWorksheet(s.sheet.slice(0, 31));
    const rows = await sectionRows(s.key, ctx);
    const head = ws.addRow([s.key === "students" ? "Roll No (OBEHUB) *" : REF, ...s.fields.map((f) => `${f.label}${f.required ? " *" : ""}`)]);
    head.font = { bold: true }; head.alignment = { wrapText: true, vertical: "top" };
    ws.getColumn(1).width = 14;
    s.fields.forEach((f, i) => { ws.getColumn(i + 2).width = Math.min(40, Math.max(14, f.label.length * 0.9)); });
    for (const r of rows) {
      const row = ws.addRow([r.ref, ...s.fields.map((f) => r.values[f.key] || "")]);
      s.fields.forEach((f, i) => { if (f.required && problemOf(f, r.values[f.key] || "") === "missing") row.getCell(i + 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2B3" } }; });
    }
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  }
  return wb.xlsx.writeBuffer();
}

/** The Student Directory in the AAS Excel-upload layout: AAS's 22 columns in order, nothing else. */
export async function studentUploadFile(ctx: Ctx) {
  const s = sectionOf("students")!;
  const rows = await sectionRows("students", ctx);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(s.fields.map((f) => f.label)).font = { bold: true };
  for (const r of rows) ws.addRow(s.fields.map((f) => r.values[f.key] || ""));
  s.fields.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });
  return wb.xlsx.writeBuffer();
}

/** Read an uploaded AAS workbook: keep each value that differs from what OBEHUB works out. */
export async function importAasWorkbook(buf: Buffer, ctx: Ctx, userId: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  let saved = 0, sheets = 0, created = 0; const skipped: string[] = [];
  const cellText = (c: ExcelJS.Cell) => { const v = c.value as any; if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`; if (v && typeof v === "object" && "text" in v) return String(v.text); if (v && typeof v === "object" && "result" in v) return String(v.result ?? ""); return (c.text || "").trim(); };
  for (const s of SECTIONS) {
    const ws = wb.getWorksheet(s.sheet.slice(0, 31));
    if (!ws) continue;
    sheets++;
    const sys = new Map((await systemRows(s.key, ctx)).map((r) => [r.ref, r.values]));
    const last = ws.rowCount;
    for (let n = 2; n <= last; n++) {
      const row = ws.getRow(n);
      let ref = cellText(row.getCell(1));
      const vals: Record<string, string> = {};
      s.fields.forEach((f, i) => { const t = cellText(row.getCell(i + 2)); if (t) vals[f.key] = t.slice(0, 4000); });
      if (!Object.keys(vals).length) continue;
      if (!ref) { if (!s.multi) ref = sys.keys().next().value || s.key; else ref = `+${(vals.cnic || vals.year || vals.name || vals.role || String(n)).slice(0, 60)}`; }
      const base = sys.get(ref) || {};
      const diff = Object.fromEntries(Object.entries(vals).filter(([k, v]) => (base[k] || "") !== v));
      if (!Object.keys(diff).length) continue;
      // Students live in the student record: find them in the batch by roll number, or add them (for institutes whose
      // students come from their own campus management system).
      if (s.key === "students") {
        if (!ctx.batchId || !ref || ref.startsWith("+")) { skipped.push(`Row ${n}: needs the student's roll number in the first column`); continue; }
        let st = await prisma.student.findFirst({ where: { batchId: ctx.batchId, rollNumber: ref }, select: { id: true, name: true } });
        if (!st) { if (!vals.name) { skipped.push(`Row ${n}: new student ${ref} needs a name`); continue; } st = await prisma.student.create({ data: { batchId: ctx.batchId, rollNumber: ref.slice(0, 40), name: vals.name.slice(0, 120) }, select: { id: true, name: true } }); created++; }
        else if (vals.name && vals.name !== st.name) await prisma.student.update({ where: { id: st.id }, data: { name: vals.name.slice(0, 120) } });
        await saveDetail("student", st.id, vals, userId); saved++; continue;
      }
      // Staff who have an OBEHUB account keep their details on their own record; others stay as directory-only rows.
      if (s.key === "faculty" && sys.has(ref)) { await saveDetail("staff", ref, diff, userId); saved++; continue; }
      const { scope, key } = storeKey(s.key, ctx, ref);
      const cur = await adb.aasRecord.findUnique({ where: { chairmanId_scope_key: { chairmanId: ctx.chairmanId, scope, key } } });
      let prev: Record<string, string> = {}; try { prev = cur ? JSON.parse(cur.dataJson) : {}; } catch { prev = {}; }
      const data = JSON.stringify({ ...prev, ...diff });
      if (cur) await adb.aasRecord.update({ where: { id: cur.id }, data: { dataJson: data, updatedById: userId, updatedAt: new Date() } });
      else await adb.aasRecord.create({ data: { id: randomUUID(), chairmanId: ctx.chairmanId, scope, key, dataJson: data, updatedById: userId } });
      saved++;
    }
  }
  return { saved, sheets, created, skipped: skipped.slice(0, 20) };
}
