import ExcelJS from "exceljs";
import { prisma } from "./db";
import { coordinatorIdsFor } from "./reportScope";
import { ensureCoursePloMapping } from "./coursePloSync";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "./contentSync";
import { renumberClos } from "./cloOrdering";
import { splitEvenly } from "./assessmentWeights";

// Bulk CLOs for every course of one batch, in one Excel file:
//   Course code | Course title | CLO | Statement | Bloom level | PLO number | Contribution % | Target %
// The CLOs' PLOs also give the course-to-PLO mapping (the OMC's PLO–Course matrix), which is filled in automatically.

export const BULK_CLO_ROLES = ["PROGRAM_COORDINATOR", "OMC", "CHAIRMAN", "DEPARTMENT_COORDINATOR"];
const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];
const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };

/** The batch, if this person may manage its CLOs. */
export async function batchForBulkClos(user: Who, batchId: string) {
  if (!BULK_CLO_ROLES.includes(user.role)) return null;
  const ids = await coordinatorIdsFor(user);
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  return batch && ids.includes(batch.coordinatorId) ? batch : null;
}

export async function buildBulkCloWorkbook(batchId: string): Promise<Buffer> {
  const [courses, plos] = await Promise.all([
    prisma.course.findMany({ where: { batchId }, include: { clos: { where: { source: "SE" }, orderBy: { orderIndex: "asc" }, include: { mappedPlo: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }),
    prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" } }),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OBE Curriculum Governance";
  const ws = wb.addWorksheet("CLOs");
  ws.columns = [
    { header: "Course code", key: "code", width: 13 }, { header: "Course title", key: "title", width: 34 }, { header: "CLO", key: "clo", width: 8 },
    { header: "Statement", key: "st", width: 70 }, { header: "Bloom level", key: "bl", width: 11 }, { header: "PLO number", key: "plo", width: 11 },
    { header: "Contribution %", key: "pct", width: 14 }, { header: "Target %", key: "tg", width: 10 }, { header: "Semester", key: "sem", width: 10 },
  ];
  for (const c of courses) {
    if (c.clos.length === 0) ws.addRow({ code: c.code, title: c.title, clo: "", st: "", bl: "", plo: "", pct: "", tg: "", sem: c.semesterNumber ?? "" });
    for (const k of c.clos) ws.addRow({ code: c.code, title: c.title, clo: k.code, st: k.statement, bl: k.bloomLevel, plo: k.mappedPlo?.number ?? "", pct: k.mappedPloId ? k.ploContributionPct ?? "" : "", tg: k.targetPct, sem: c.semesterNumber ?? "" });
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEADC" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn("st").alignment = { wrapText: true, vertical: "top" };

  const ps = wb.addWorksheet("PLOs");
  ps.columns = [{ header: "PLO number", key: "n", width: 11 }, { header: "Title", key: "t", width: 36 }, { header: "Description", key: "d", width: 80 }];
  for (const p of plos) ps.addRow({ n: p.number, t: p.title, d: p.description });
  ps.getRow(1).font = { bold: true };

  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 110;
  [
    "One row per CLO. Course code must match a course of this batch exactly as it appears in the app (e.g. CS101).",
    "CLO: leave blank for a new CLO (it gets the next number), or keep CLO-1, CLO-2 ... to update that CLO.",
    "Bloom level: C1 to C6.   PLO number: a number from the PLOs sheet (1, 2, 3 ...). Leave blank if the CLO maps to no PLO.",
    "Contribution %: share of that PLO this CLO carries inside the course. Leave blank and CLOs on the same PLO share it equally (3 CLOs -> 34/33/33).",
    "Target %: expected share of students attaining the CLO (default 60).",
    "The course-to-PLO mapping (PLO–Course matrix) is filled in automatically from the PLOs of each course's CLOs.",
    "Courses whose template the OMC has approved (locked) and courses that copy their content from a base course are skipped; the result lists them.",
  ].forEach((t) => help.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Row = { code: string; clo: string; statement: string; bloom: string; plo: string; pct: string; target: string; rowNo: number };

export async function importBulkClos(opts: { batchId: string; file: File; userId: string; removeMissing: boolean }) {
  const { batchId, file, userId, removeMissing } = opts;
  const grid: string[][] = [];
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) {
    for (const l of buf.toString("utf-8").split(/\r?\n/)) grid.push(l.split(",").map((x) => x.trim()));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet("CLOs") || wb.worksheets[0];
    if (!ws) throw new Error("the file has no sheet");
    ws.eachRow({ includeEmpty: false }, (row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = String(c.text ?? "").trim(); }); grid.push(cells); });
  }
  const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hi = grid.findIndex((r) => r.some((c) => /^course code$/.test(norm(c))) && r.some((c) => /^statement$/.test(norm(c))));
  if (hi < 0) throw new Error("no heading row with \"Course code\" and \"Statement\" found - download the template and fill that in");
  const col = (re: RegExp) => grid[hi].findIndex((c) => re.test(norm(c)));
  const C = { code: col(/^course code$/), clo: col(/^clo$/), st: col(/^statement$/), bl: col(/^bloom/), plo: col(/^plo/), pct: col(/^contribution/), tg: col(/^target/) };
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");
  const rows: Row[] = grid.slice(hi + 1).map((r, i) => ({ code: at(r, C.code), clo: at(r, C.clo), statement: at(r, C.st), bloom: at(r, C.bl).toUpperCase().replace(/\s+/g, ""), plo: at(r, C.plo), pct: at(r, C.pct), target: at(r, C.tg), rowNo: hi + i + 2 }))
    .filter((r) => r.code && r.statement);

  const [courses, plos] = await Promise.all([
    prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true, templateStatus: true } }),
    prisma.pLO.findMany({ where: { batchId }, select: { id: true, number: true } }),
  ]);
  const ploByNumber = new Map(plos.map((p) => [p.number, p.id]));
  const coursesByCode = new Map<string, typeof courses>();
  for (const c of courses) coursesByCode.set(normCode(c.code), [...(coursesByCode.get(normCode(c.code)) || []), c]);

  const errors: string[] = [];
  const skipped: string[] = [];
  const byCourse = new Map<string, Row[]>();
  for (const r of rows) {
    if (!coursesByCode.has(normCode(r.code))) { errors.push(`Row ${r.rowNo}: no course "${r.code}" in this batch`); continue; }
    if (!BLOOM.includes(r.bloom)) { errors.push(`Row ${r.rowNo} (${r.code}): Bloom level must be C1 to C6`); continue; }
    if (r.plo) {
      const n = parseInt(r.plo.replace(/\D+/g, ""), 10);
      if (!ploByNumber.has(n)) { errors.push(`Row ${r.rowNo} (${r.code}): PLO ${r.plo} does not exist for this batch`); continue; }
    }
    const k = normCode(r.code);
    byCourse.set(k, [...(byCourse.get(k) || []), r]);
  }

  let added = 0, updated = 0, removed = 0, coursesDone = 0, mappingsAdded = 0;
  for (const [k, list] of Array.from(byCourse.entries())) {
    for (const course of coursesByCode.get(k)!) {
      if (course.templateStatus === "approved") { skipped.push(`${course.code}: approved by the OMC and locked`); continue; }
      const blocked = await blockedAsNonBaseCourse(course.id);
      if (blocked) { skipped.push(`${course.code}: copies its content from a base course - import into the base course instead`); continue; }

      const existing = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } });
      const byCloCode = new Map(existing.map((c) => [c.code.toUpperCase().replace(/\s+/g, ""), c]));
      let count = existing.length;
      const touched = new Set<string>();
      const blankPct = new Set<string>();
      for (const r of list) {
        const ploId = r.plo ? ploByNumber.get(parseInt(r.plo.replace(/\D+/g, ""), 10)) || null : null;
        const pct = r.pct ? Math.min(100, Math.max(0, parseInt(r.pct, 10) || 0)) : null;
        if (ploId && pct == null) blankPct.add(ploId);
        const target = r.target ? Math.min(100, Math.max(1, parseInt(r.target, 10) || 60)) : undefined;
        const data = { statement: r.statement, bloomLevel: r.bloom, mappedPloId: ploId, ploMappingSource: ploId ? "MANUAL" : null, ploContributionPct: ploId ? pct ?? 100 : null, ...(target ? { targetPct: target } : {}) };
        const match = r.clo ? byCloCode.get(r.clo.toUpperCase().replace(/\s+/g, "")) : undefined;
        if (match && !touched.has(match.id)) { await prisma.cLO.update({ where: { id: match.id }, data }); touched.add(match.id); updated++; }
        else { const made = await prisma.cLO.create({ data: { courseId: course.id, source: "SE", code: `CLO-${count + 1}`, orderIndex: count, ...data } }); touched.add(made.id); count++; added++; }
      }
      // Optionally drop CLOs that are not in the file, unless lecture topics already use them.
      if (removeMissing) {
        for (const c of existing.filter((x) => !touched.has(x.id))) {
          const inUse = await prisma.lectureRow.count({ where: { cloId: c.id } });
          if (inUse > 0) { skipped.push(`${course.code} ${c.code}: kept (used by ${inUse} lecture topic(s))`); continue; }
          await prisma.paperDistributionItem.updateMany({ where: { cloId: c.id }, data: { cloId: null } });
          await prisma.cLO.delete({ where: { id: c.id } });
          removed++;
        }
        await renumberClos(course.id, "SE");
      }
      // CLOs sharing a PLO with no contribution given share it equally.
      for (const ploId of Array.from(blankPct)) {
        const on = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE", mappedPloId: ploId }, orderBy: { orderIndex: "asc" }, select: { id: true } });
        const parts = splitEvenly(100, on.length).map((p) => Math.round(p));
        // Whole percentages: give any rounding difference to the last CLO.
        const diff = 100 - parts.reduce((a, b) => a + b, 0); if (parts.length) parts[parts.length - 1] += diff;
        for (let i = 0; i < on.length; i++) await prisma.cLO.update({ where: { id: on[i].id }, data: { ploContributionPct: parts[i] } });
      }
      // Course-to-PLO mapping from the CLOs.
      const mapped = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE", mappedPloId: { not: null } }, select: { mappedPloId: true }, distinct: ["mappedPloId"] });
      for (const m of mapped) {
        const had = await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: course.id, ploId: m.mappedPloId! } } });
        if (!had) { await ensureCoursePloMapping(course.id, m.mappedPloId!, userId, "MANUAL"); mappingsAdded++; }
      }
      await syncCourseContentToLinkedCourses(course.id).catch(() => {});
      coursesDone++;
    }
  }
  const untouched = courses.filter((c) => !byCourse.has(normCode(c.code))).map((c) => c.code);
  return { coursesDone, added, updated, removed, mappingsAdded, errors: errors.slice(0, 30), skipped: skipped.slice(0, 30), untouched };
}
