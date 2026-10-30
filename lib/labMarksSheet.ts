import ExcelJS from "exceljs";
import { prisma } from "./db";
import { parseCsv } from "./lmsImport";
import { labTasks } from "./labPlanCore";

// Lab marks as a spreadsheet: Roll Number, Name, then one column per lab ("Lab 3 (out of 10)").
// The download is filled with the class and any marks already entered; the upload reads the same layout.

export async function labRoster(labId: string) {
  const en = await prisma.studentEnrollment.findMany({ where: { courseId: labId, status: "ACTIVE" }, include: { student: { select: { id: true, name: true, rollNumber: true } } } });
  return en.map((e) => e.student).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
}

export async function labColumns(labId: string) {
  const [tasks, marks] = await Promise.all([labTasks(labId).catch(() => []), prisma.labMark.findMany({ where: { courseId: labId }, select: { labNumber: true, maxScore: true }, distinct: ["labNumber"] })]);
  const nums = Array.from(new Set([...tasks.map((t) => t.labNumber), ...marks.map((m) => m.labNumber)])).sort((a, b) => a - b);
  return (nums.length ? nums : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((n) => ({ labNumber: n, title: tasks.find((t) => t.labNumber === n)?.title || "", maxScore: marks.find((m) => m.labNumber === n)?.maxScore || 10 }));
}

export async function labMarksWorkbook(lab: { id: string; code: string; title: string }) {
  const [students, cols, marks] = await Promise.all([labRoster(lab.id), labColumns(lab.id), prisma.labMark.findMany({ where: { courseId: lab.id }, select: { studentId: true, labNumber: true, score: true } })]);
  const got = new Map(marks.map((m) => [`${m.studentId}:${m.labNumber}`, m.score]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lab marks");
  const head = ws.addRow(["Roll Number", "Name", ...cols.map((c) => `Lab ${c.labNumber} (out of ${c.maxScore})`)]);
  head.font = { bold: true };
  for (const s of students) ws.addRow([s.rollNumber, s.name, ...cols.map((c) => got.get(`${s.id}:${c.labNumber}`) ?? null)]);
  ws.getColumn(1).width = 16; ws.getColumn(2).width = 28; cols.forEach((_, i) => { ws.getColumn(i + 3).width = 16; });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 110;
  [`Lab marks — ${lab.code} ${lab.title}`, "Fill a mark under each lab. 0 means present and scored zero; A or Abs means absent (any saved mark is removed). Leave a cell empty to keep what is already saved (or to leave it unmarked = absent).",
    "To change what a lab is marked out of, edit the number in its heading, e.g. Lab 3 (out of 20). Add a column such as Lab 13 (out of 10) for another lab.",
    "Keep the Roll Number column; names are only for reading. Students not enrolled in this lab are reported and skipped.",
    "Labs: " + cols.map((c) => `Lab ${c.labNumber}${c.title ? ` ${c.title}` : ""}`).join("; ")].forEach((t, i) => { const r = info.addRow([t]); if (i === 0) r.font = { bold: true, size: 13 }; });
  return wb.xlsx.writeBuffer();
}

export type Parsed = { labs: { labNumber: number; maxScore: number; filled: number; changed: number }[]; unknown: string[]; errors: string[]; writes: { studentId: string; labNumber: number; score: number; maxScore: number }[]; absents?: { studentId: string; labNumber: number }[] };

/** Read an uploaded lab marks sheet (.xlsx or .csv) and work out what would change. Nothing is saved here. */
export async function parseLabMarks(labId: string, file: File): Promise<Parsed | { error: string }> {
  let grid: string[][] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.csv$/i.test(file.name)) grid = parseCsv(buf.toString("utf-8"));
    else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.getWorksheet("Lab marks") || wb.worksheets[0];
      if (!ws) return { error: "The file has no sheet." };
      ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { const v = c.value as any; cells[i - 1] = v && typeof v === "object" && "result" in v ? String(v.result ?? "") : (c.text || "").trim(); }); grid.push(cells); });
    }
  } catch { return { error: "Could not read that file. Upload the .xlsx (or .csv) from Download format." }; }
  const hi = grid.findIndex((r) => r.some((c) => /roll/i.test(c || "")));
  if (hi < 0) return { error: "No heading row with a Roll Number column was found." };
  const head = grid[hi];
  const rollCol = head.findIndex((c) => /roll/i.test(c || ""));
  const labCols = head.map((c, i) => { const m = /^\s*lab\s*(\d+)\b(?:.*?(?:out of|\/)\s*([\d.]+))?/i.exec(c || ""); return m ? { i, labNumber: +m[1], maxScore: m[2] ? +m[2] : NaN } : null; }).filter((x): x is { i: number; labNumber: number; maxScore: number } => !!x && x.labNumber >= 1 && x.labNumber <= 40);
  if (!labCols.length) return { error: 'No lab columns were found. Headings should read like "Lab 1 (out of 10)".' };
  const roster = await labRoster(labId);
  const byRoll = new Map(roster.map((s) => [s.rollNumber.trim().toLowerCase(), s]));
  const existing = await prisma.labMark.findMany({ where: { courseId: labId }, select: { studentId: true, labNumber: true, score: true, maxScore: true } });
  const known = new Map(existing.map((m) => [`${m.studentId}:${m.labNumber}`, m]));
  const maxOf = new Map(existing.map((m) => [m.labNumber, m.maxScore]));
  const out: Parsed = { labs: [], unknown: [], errors: [], writes: [] };
  for (const c of labCols) {
    const maxScore = Number.isFinite(c.maxScore) && c.maxScore > 0 ? c.maxScore : maxOf.get(c.labNumber) || 10;
    const lab = { labNumber: c.labNumber, maxScore, filled: 0, changed: 0 };
    const oldMax = maxOf.get(c.labNumber);
    if (oldMax && oldMax !== maxScore && existing.some((m) => m.labNumber === c.labNumber && m.score > maxScore)) out.errors.push(`Lab ${c.labNumber}: some saved marks are above ${maxScore}, so it cannot be changed from out of ${oldMax}.`);
    grid.slice(hi + 1).forEach((r, k) => {
      const roll = (r[rollCol] || "").trim();
      const raw = (r[c.i] || "").trim();
      if (!roll || raw === "") return;
      const s = byRoll.get(roll.toLowerCase());
      if (!s) { if (!out.unknown.includes(roll)) out.unknown.push(roll); return; }
      if (/^(a|abs|absent)$/i.test(raw)) { (out.absents ||= []).push({ studentId: s.id, labNumber: c.labNumber }); return; }
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > maxScore) { out.errors.push(`Row ${hi + k + 2}, ${roll}, Lab ${c.labNumber}: "${raw}" is not a mark between 0 and ${maxScore}.`); return; }
      lab.filled++;
      const old = known.get(`${s.id}:${c.labNumber}`);
      if (!old || old.score !== score || old.maxScore !== maxScore) { lab.changed++; out.writes.push({ studentId: s.id, labNumber: c.labNumber, score, maxScore }); }
    });
    out.labs.push(lab);
  }
  return out;
}
