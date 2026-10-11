import ExcelJS from "exceljs";
import { prisma } from "./db";

// Imports a whole program into a master curriculum from one Excel file in the layout of the full download:
//   Program  (Degree program | Authority | Version)       - optional, names the curriculum
//   PLOs     (PLO | Title | Description)
//   Courses  (Semester | Code | Title | Credit hours | Category | Domain | Prerequisite | Description | Textbook | Reference material)
//   CLOs and PLO mapping (Course code | CLO | Statement | Bloom level | Mapped PLO)
//   Lecture topics (Course code | Lecture | Topic | Subtopic)
// PLOs are matched by number, courses by code (updated, never duplicated). For every course that has rows in the CLO or
// topic sheet, its CLOs / topics are replaced by the file's. Everything is written in a few bulk queries.

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "A1", "A2", "A3", "A4", "A5"];
const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const up = (s?: string) => (s || "").trim().toUpperCase();

type Sheet = { headers: string[]; rows: string[][] };
async function readSheets(file: File): Promise<Map<string, Sheet>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const out = new Map<string, Sheet>();
  for (const ws of wb.worksheets) {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = String(c.text ?? "").trim(); }); grid.push(cells); });
    if (grid.length) out.set(norm(ws.name), { headers: grid[0].map((h) => norm(h)), rows: grid.slice(1) });
  }
  return out;
}
const colOf = (s: Sheet, re: RegExp) => s.headers.findIndex((h) => re.test(h));
const get = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");

export async function readProgramInfo(file: File) {
  const sheets = await readSheets(file);
  const p = sheets.get("program") || sheets.get("curriculum");
  if (!p) return null;
  // Either a header row (Degree program | Authority | Version) with one value row, or key/value rows.
  const kv = new Map<string, string>();
  if (p.headers.includes("degree program")) p.headers.forEach((h, i) => kv.set(h, get(p.rows[0] || [], i)));
  else p.rows.forEach((r) => kv.set(norm(r[0]), (r[1] || "").trim()));
  return { degreeProgram: kv.get("degree program") || "", authority: kv.get("authority") || "", version: kv.get("version") || "" };
}

export async function importFullCurriculum(curriculumId: string, file: File) {
  const sheets = await readSheets(file);
  const errors: string[] = [];
  const counts = { plos: 0, coursesCreated: 0, coursesUpdated: 0, clos: 0, topics: 0 };

  // PLOs
  const ploSheet = sheets.get("plos");
  if (ploSheet) {
    const cN = colOf(ploSheet, /^(plo|plo number|number|no)$/), cT = colOf(ploSheet, /^title$/), cD = colOf(ploSheet, /^description$/);
    const existing = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId } });
    for (const r of ploSheet.rows) {
      const n = parseInt(get(r, cN).replace(/\D+/g, ""), 10);
      if (!Number.isFinite(n)) continue;
      const data = { title: get(r, cT) || `PLO-${n}`, description: get(r, cD) || get(r, cT) || `PLO-${n}` };
      const had = existing.find((x) => x.number === n);
      if (had) await prisma.masterPLO.update({ where: { id: had.id }, data });
      else await prisma.masterPLO.create({ data: { masterCurriculumId: curriculumId, number: n, ...data } });
      counts.plos++;
    }
  }

  // Courses
  const cs = sheets.get("courses");
  if (cs) {
    const c = { sem: colOf(cs, /^semester$/), code: colOf(cs, /^code$/), title: colOf(cs, /^title$/), cr: colOf(cs, /^credit/), cat: colOf(cs, /^category$/), dom: colOf(cs, /^domain$/),
      pre: colOf(cs, /^prerequisite$/), desc: colOf(cs, /^description$/), tb: colOf(cs, /^textbook$/), ref: colOf(cs, /^reference/) };
    if (c.code < 0 || c.title < 0) errors.push("Courses sheet needs Code and Title columns");
    else {
      const existing = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, code: true } });
      const byCode = new Map(existing.map((x) => [up(x.code), x.id]));
      const prereq: [string, string][] = [];
      for (const r of cs.rows) {
        const code = get(r, c.code), title = get(r, c.title);
        if (!code || !title) continue;
        const sem = parseInt(get(r, c.sem), 10);
        const data = {
          code, title, creditHours: parseInt(get(r, c.cr), 10) || 3, category: get(r, c.cat) || "Major", domain: get(r, c.dom) || null,
          semesterNumber: Number.isFinite(sem) && sem > 0 ? sem : null,
          catalogDescription: get(r, c.desc) || null, textbook: get(r, c.tb) || null, referenceMaterial: get(r, c.ref) || null,
        };
        const id = byCode.get(up(code));
        if (id) { await prisma.masterCourse.update({ where: { id }, data }); counts.coursesUpdated++; }
        else { const made = await prisma.masterCourse.create({ data: { masterCurriculumId: curriculumId, ...data } }); byCode.set(up(code), made.id); counts.coursesCreated++; }
        if (get(r, c.pre)) prereq.push([code, get(r, c.pre)]);
      }
      for (const [code, pre] of prereq) {
        const id = byCode.get(up(code)), pid = byCode.get(up(pre.split(/[,;/]/)[0]));
        if (id && pid && id !== pid) await prisma.masterCourse.update({ where: { id }, data: { prerequisiteCourseId: pid } });
      }
    }
  }

  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, code: true } });
  const courseByCode = new Map(courses.map((x) => [up(x.code), x.id]));
  const plos = await prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true } });
  const ploByNumber = new Map(plos.map((p) => [p.number, p.id]));

  // CLOs
  const cl = sheets.get("clos and plo mapping") || sheets.get("clos");
  if (cl) {
    const c = { code: colOf(cl, /^course code$/), st: colOf(cl, /^statement$/), bl: colOf(cl, /^bloom/), plo: colOf(cl, /^(mapped )?plo$/) };
    const byCourse = new Map<string, { statement: string; bloomLevel: string; mappedPloId: string | null }[]>();
    for (const r of cl.rows) {
      const id = courseByCode.get(up(get(r, c.code)));
      const statement = get(r, c.st);
      if (!statement) continue;
      if (!id) { errors.push(`CLO for unknown course ${get(r, c.code)}`); continue; }
      let bloom = up(get(r, c.bl)).replace(/\s+/g, "");
      if (!BLOOM.includes(bloom)) bloom = "C2";
      const n = parseInt(get(r, c.plo).replace(/\D+/g, ""), 10);
      byCourse.set(id, [...(byCourse.get(id) || []), { statement, bloomLevel: bloom, mappedPloId: Number.isFinite(n) ? ploByNumber.get(n) || null : null }]);
    }
    const ids = Array.from(byCourse.keys());
    const data = ids.flatMap((id) => byCourse.get(id)!.map((x, i) => ({ masterCourseId: id, ...x, orderIndex: i, ploMappingSource: x.mappedPloId ? "MANUAL" : null })));
    if (ids.length) await prisma.$transaction([prisma.masterCourseClo.deleteMany({ where: { masterCourseId: { in: ids } } }), prisma.masterCourseClo.createMany({ data })]);
    counts.clos = data.length;
  }

  // Lecture topics
  const tp = sheets.get("lecture topics") || sheets.get("topics");
  if (tp) {
    const c = { code: colOf(tp, /^course code$/), lec: colOf(tp, /^lecture$/), topic: colOf(tp, /^topic$/), sub: colOf(tp, /^subtopic$/) };
    const byCourse = new Map<string, Map<number, { topic: string; subtopic: string | null }>>();
    for (const r of tp.rows) {
      const id = courseByCode.get(up(get(r, c.code)));
      const lec = parseInt(get(r, c.lec), 10), topic = get(r, c.topic);
      if (!id || !Number.isFinite(lec) || lec < 1 || !topic) continue;
      if (!byCourse.has(id)) byCourse.set(id, new Map());
      byCourse.get(id)!.set(lec, { topic, subtopic: get(r, c.sub) || null });
    }
    const ids = Array.from(byCourse.keys());
    const data = ids.flatMap((id) => Array.from(byCourse.get(id)!.entries()).map(([lectureNumber, t]) => ({ masterCourseId: id, lectureNumber, ...t })));
    if (ids.length) await prisma.$transaction([prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: { in: ids } } }), prisma.masterCourseTopic.createMany({ data })]);
    counts.topics = data.length;
  }
  return { ...counts, errors: errors.slice(0, 20) };
}
