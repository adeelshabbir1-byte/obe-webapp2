import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
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

  // Two queries in one transaction for the whole file (one per course used to run past the time limit on large curricula).
  const ids = Array.from(byCourse.keys()).map((code) => courseByCode.get(code)!);
  const data = Array.from(byCourse.entries()).flatMap(([code, list]) => list.map((c, i) => ({ masterCourseId: courseByCode.get(code)!, statement: c.statement, bloomLevel: c.bloom, orderIndex: i, mappedPloId: c.ploId, ploMappingSource: c.ploId ? "MANUAL" : null })));
  await prisma.$transaction([
    prisma.masterCourseClo.deleteMany({ where: { masterCourseId: { in: ids } } }),
    prisma.masterCourseClo.createMany({ data }),
  ]);
  const clos = data.length;
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
  let keptOwn = 0;
  const missing: string[] = [];
  const pairs: { src: (typeof from.courses)[number]; tgt: (typeof to.courses)[number] }[] = [];
  for (const src of from.courses) {
    if (src.seedClos.length === 0) continue;
    const tgt = targetByCode.get(norm(src.code));
    if (!tgt) { missing.push(src.code); continue; }
    if (opts.onlyEmpty && tgt._count.seedClos > 0) { keptOwn++; continue; }
    pairs.push({ src, tgt });
  }
  // Everything in a handful of bulk queries so even a 300-course curriculum finishes well inside the time limit.
  const tgtIds = pairs.map((p) => p.tgt.id);
  const cloData = pairs.flatMap(({ src, tgt }) => src.seedClos.map((c, i) => ({ masterCourseId: tgt.id, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: i, mappedPloId: c.mappedPlo ? toPlo.get(c.mappedPlo.number) || null : null, ploMappingSource: c.mappedPlo ? c.ploMappingSource || "MANUAL" : null })));
  if (pairs.length) {
    await prisma.$transaction([
      prisma.masterCourseClo.deleteMany({ where: { masterCourseId: { in: tgtIds } } }),
      prisma.masterCourseClo.createMany({ data: cloData }),
    ]);
  }
  // Lecture topics only for target courses that have none.
  const withTopics = new Set((await prisma.masterCourseTopic.groupBy({ by: ["masterCourseId"], where: { masterCourseId: { in: tgtIds.length ? tgtIds : ["none"] } } })).map((g) => g.masterCourseId));
  const needTopics = pairs.filter((p) => !withTopics.has(p.tgt.id));
  let topicsCopied = 0;
  if (needTopics.length) {
    const srcTopics = await prisma.masterCourseTopic.findMany({ where: { masterCourseId: { in: needTopics.map((p) => p.src.id) } } });
    const tgtOf = new Map(needTopics.map((p) => [p.src.id, p.tgt.id]));
    const data = srcTopics.map((t) => ({ masterCourseId: tgtOf.get(t.masterCourseId)!, lectureNumber: t.lectureNumber, topic: t.topic, subtopic: t.subtopic }));
    if (data.length) { await prisma.masterCourseTopic.createMany({ data, skipDuplicates: true }); topicsCopied = new Set(data.map((d) => d.masterCourseId)).size; }
  }
  // Empty textbook/description/references filled from the source, one bulk UPDATE per 200 courses.
  const fills = pairs.filter(({ src, tgt }) => (!tgt.textbook && src.textbook) || (!tgt.catalogDescription && src.catalogDescription) || (!tgt.referenceMaterial && src.referenceMaterial));
  for (let i = 0; i < fills.length; i += 200) {
    const rows = fills.slice(i, i + 200).map(({ src, tgt }) => Prisma.sql`(${tgt.id}::text, ${src.textbook}::text, ${src.catalogDescription}::text, ${src.referenceMaterial}::text)`);
    await prisma.$executeRaw`UPDATE "MasterCourse" AS m SET
      "textbook" = COALESCE(NULLIF(m."textbook", ''), v.tb),
      "catalogDescription" = COALESCE(NULLIF(m."catalogDescription", ''), v.cd),
      "referenceMaterial" = COALESCE(NULLIF(m."referenceMaterial", ''), v.rm)
      FROM (VALUES ${Prisma.join(rows)}) AS v(id, tb, cd, rm) WHERE m."id" = v.id`;
  }
  const courses = pairs.length, clos = cloData.length;
  return { courses, clos, keptOwn, topicsCopied, missing: missing.slice(0, 20) };
}
