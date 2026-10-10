import ExcelJS from "exceljs";
import { prisma } from "./db";

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];
const norm = (s: string) => s.trim().toUpperCase();

/**
 * Loads CLOs (with PLO numbers) from an Excel/CSV file into a master curriculum: Course code, CLO, Statement, Bloom level, Mapped PLO.
 * For every course code in the file, that course's CLOs are REPLACED by the file's. Courses not in the file are untouched.
 * Used for an institute's own copy (OMC) and for the shared official copy (Super User).
 */
export async function importClosIntoMasterCurriculum(curriculumId: string, file: File): Promise<{ ok: true; courses: number; clos: number; errors: string[] } | { ok: false; error: string; errors?: string[] }> {
  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, include: { plos: true, courses: { select: { id: true, code: true } } } });
  if (!curriculum) return { ok: false, error: "curriculum not found" };

  const grid: string[][] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".csv")) {
      for (const l of buf.toString("utf-8").split(/\r?\n/)) grid.push(l.split(",").map((x) => x.trim()));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      // Prefer the sheet that has the CLO columns.
      const ws = wb.worksheets.find((w) => { let ok = false; w.getRow(1).eachCell((c) => { if (/statement/i.test(c.text || "")) ok = true; }); return ok; }) || wb.worksheets[0];
      ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); });
    }
  } catch { return { ok: false, error: "could not read that file" }; }

  const hi = grid.findIndex((r) => r.some((c) => /statement/i.test(c || "")) && r.some((c) => /course\s*code|^code$/i.test(c || "")));
  if (hi < 0) return { ok: false, error: "no heading row with Course code and Statement found" };
  const f = (re: RegExp) => grid[hi].findIndex((c) => re.test(c || ""));
  const col = { code: f(/course\s*code|^code$/i), clo: f(/^clo$/i), st: f(/statement/i), bloom: f(/bloom/i), plo: f(/(mapped\s*)?plo/i) };
  if (col.bloom < 0) return { ok: false, error: "a Bloom level column is needed" };

  const courseByCode = new Map(curriculum.courses.map((c) => [norm(c.code), c.id]));
  const ploByNumber = new Map(curriculum.plos.map((p) => [p.number, p.id]));
  const byCourse = new Map<string, { statement: string; bloom: string; ploId: string | null }[]>();
  const errors: string[] = [];
  for (const r of grid.slice(hi + 1)) {
    const code = norm(r[col.code] || "");
    if (!code) continue;
    if (!courseByCode.has(code)) { errors.push(`Course ${code} is not in this curriculum`); continue; }
    const statement = (r[col.st] || "").replace(/\s*\[new draft CLO\]\s*$/i, "").trim();
    const bloom = (r[col.bloom] || "").toUpperCase().replace(/\s+/g, "");
    if (!statement || !BLOOM.includes(bloom)) { errors.push(`${code} ${r[col.clo] || ""}: needs a statement and Bloom level C1 to C6`); continue; }
    let ploId: string | null = null;
    if (col.plo >= 0 && r[col.plo]) {
      const n = parseInt(String(r[col.plo]).replace(/\D+/g, ""), 10);
      ploId = ploByNumber.get(n) || null;
      if (!ploId) errors.push(`${code}: PLO-${n} does not exist in this curriculum`);
    }
    byCourse.set(code, [...(byCourse.get(code) || []), { statement, bloom, ploId }]);
  }
  if (byCourse.size === 0) return { ok: false, error: "no usable CLO rows found", errors: errors.slice(0, 10) };

  let clos = 0;
  for (const [code, list] of Array.from(byCourse.entries())) {
    const courseId = courseByCode.get(code)!;
    await prisma.$transaction([
      prisma.masterCourseClo.deleteMany({ where: { masterCourseId: courseId } }),
      prisma.masterCourseClo.createMany({
        data: list.map((c, i) => ({ masterCourseId: courseId, statement: c.statement, bloomLevel: c.bloom, orderIndex: i, mappedPloId: c.ploId, ploMappingSource: c.ploId ? "MANUAL" : null })),
      }),
    ]);
    clos += list.length;
  }
  return { ok: true, courses: byCourse.size, clos, errors: Array.from(new Set(errors)).slice(0, 15) };
}

/**
 * Copies CLOs (with PLO mapping, matched by PLO number) course by course (matched by code) from one master curriculum to another.
 * Only source courses that have CLOs are copied. With onlyEmpty, target courses that already have CLOs are left alone;
 * otherwise their CLOs are replaced. Lecture topics are copied only where the target course has none.
 */
export async function copyMasterClos(fromId: string, toId: string, opts: { onlyEmpty: boolean }) {
  const [from, to] = await Promise.all([
    prisma.masterCurriculum.findUnique({ where: { id: fromId }, include: { plos: true, courses: { include: { seedClos: { orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true } } } } } } } }),
    prisma.masterCurriculum.findUnique({ where: { id: toId }, include: { plos: true, courses: { include: { _count: { select: { seedClos: true } } } } } }),
  ]);
  if (!from || !to) return null;
  const targetByCode = new Map(to.courses.map((c) => [norm(c.code), c]));
  const toPlo = new Map(to.plos.map((p) => [p.number, p.id]));
  let courses = 0, clos = 0, keptOwn = 0, topicsCopied = 0;
  const missing: string[] = [];
  for (const src of from.courses) {
    if (src.seedClos.length === 0) continue;
    const tgt = targetByCode.get(norm(src.code));
    if (!tgt) { missing.push(src.code); continue; }
    if (opts.onlyEmpty && tgt._count.seedClos > 0) { keptOwn++; continue; }
    await prisma.$transaction([
      prisma.masterCourseClo.deleteMany({ where: { masterCourseId: tgt.id } }),
      prisma.masterCourseClo.createMany({
        data: src.seedClos.map((c, i) => ({ masterCourseId: tgt.id, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: i, mappedPloId: c.mappedPlo ? toPlo.get(c.mappedPlo.number) || null : null, ploMappingSource: c.mappedPlo ? c.ploMappingSource || "MANUAL" : null })),
      }),
    ]);
    const tgtTopics = await prisma.masterCourseTopic.count({ where: { masterCourseId: tgt.id } });
    if (tgtTopics === 0) {
      const topics = await prisma.masterCourseTopic.findMany({ where: { masterCourseId: src.id } });
      if (topics.length) { await prisma.masterCourseTopic.createMany({ data: topics.map((t) => ({ masterCourseId: tgt.id, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic })), skipDuplicates: true }); topicsCopied++; }
    }
    // Fill empty textbook/description/references from the source.
    if (!tgt.textbook || !tgt.catalogDescription || !tgt.referenceMaterial) {
      await prisma.masterCourse.update({ where: { id: tgt.id }, data: { textbook: tgt.textbook || src.textbook, catalogDescription: tgt.catalogDescription || src.catalogDescription, referenceMaterial: tgt.referenceMaterial || src.referenceMaterial } });
    }
    courses++; clos += src.seedClos.length;
  }
  return { courses, clos, keptOwn, topicsCopied, missing: missing.slice(0, 20) };
}
