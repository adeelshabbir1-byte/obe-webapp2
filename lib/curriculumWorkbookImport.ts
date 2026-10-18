import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { prisma } from "./db";

// Creates a whole master curriculum from one workbook (the "full curriculum" layout):
//   Curriculum  : Item | Value  (Degree program, Authority, Version, Source)
//   PLOs        : PLO number | Title | Description
//   Courses     : Code | Title | Credit hours | Category | Domain | Semester | Placeholder | Description | Textbook | Reference material
//   CLOs and PLO mapping : Course code | CLO | Statement | Bloom level | Mapped PLO
//   Lecture topics       : Course code | Lecture | Topic | Subtopic | CLO (e.g. CLO-2)
// Everything is written with a few bulk inserts, so a 100-course program takes seconds.

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const code = (s: unknown) => String(s ?? "").trim().toUpperCase();

type Sheet = { header: string[]; rows: string[][] };
function readSheet(ws: ExcelJS.Worksheet | undefined): Sheet | null {
  if (!ws) return null;
  const grid: string[][] = [];
  ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = String(c.text ?? "").trim(); }); grid.push(cells); });
  if (!grid.length) return null;
  return { header: grid[0].map(norm), rows: grid.slice(1).filter((r) => r.some((c) => c)) };
}
const col = (s: Sheet, re: RegExp) => s.header.findIndex((h) => re.test(h));
const at = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");

export async function importCurriculumWorkbook(file: File, owner: { chairmanId: string | null }) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any); } catch { return { error: "could not read that file - upload the .xlsx workbook" }; }
  const sheet = (re: RegExp) => readSheet(wb.worksheets.find((w) => re.test(norm(w.name))));
  const meta = sheet(/^curriculum$|^program$/), ploS = sheet(/^(plos?|gas?|graduate attributes)$/), courseS = sheet(/^courses$/), cloS = sheet(/^clos/), topicS = sheet(/^lecture topics|^topics$/);
  if (!ploS || !courseS) return { error: "the workbook needs at least a \"GAs\" sheet and a \"Courses\" sheet" };

  const info = new Map<string, string>();
  if (meta) {
    // Either Item | Value rows, or a header row (Degree program | Authority | Version) with one value row.
    if (meta.header.includes("degree program")) meta.header.forEach((h, i) => info.set(h, at(meta.rows[0] || [], i)));
    else { const k = col(meta, /^item$/), v = col(meta, /^value$/); meta.rows.forEach((r) => info.set(norm(at(r, k >= 0 ? k : 0)), at(r, v >= 0 ? v : 1))); }
  }
  const degreeProgram = info.get("degree program") || "";
  const authority = info.get("authority") || "Institute";
  const version = info.get("version") || String(new Date().getFullYear());
  if (!degreeProgram) return { error: "the \"Curriculum\" sheet needs a \"Degree program\" row" };

  const dup = await prisma.masterCurriculum.findFirst({ where: { title: degreeProgram, version, authority, chairmanId: owner.chairmanId } });
  if (dup) return { error: `"${degreeProgram}" (${authority}, ${version}) already exists. Rename the version in the Curriculum sheet to import it again.` };

  const warnings: string[] = [];
  // PLOs
  const pn = col(ploS, /^(plo|ga)( number)?$|^number$|^#$/), pt = col(ploS, /^title$/), pd = col(ploS, /^description$/);
  const plos = ploS.rows.map((r) => ({ id: randomUUID(), number: parseInt(at(r, pn).replace(/\D+/g, ""), 10), title: at(r, pt), description: at(r, pd) || at(r, pt) }))
    .filter((p) => Number.isFinite(p.number) && p.title);
  if (!plos.length) return { error: "no GAs found (columns: GA number, Title, Description)" };
  const ploByNo = new Map(plos.map((p) => [p.number, p.id]));

  // Courses
  const C = { code: col(courseS, /^code$/), title: col(courseS, /^title$/), cr: col(courseS, /^credit/), cat: col(courseS, /^categor/), dom: col(courseS, /^domain$/), sem: col(courseS, /^semester$/),
    desc: col(courseS, /^description$/), tb: col(courseS, /^textbook$/), ref: col(courseS, /^reference/) };
  if (C.code < 0 || C.title < 0 || C.cr < 0 || C.cat < 0) return { error: "the Courses sheet needs Code, Title, Credit hours and Category columns" };
  const courses: { id: string; code: string; title: string; creditHours: number; category: string; domain: string | null; semesterNumber: number | null; catalogDescription: string | null; textbook: string | null; referenceMaterial: string | null }[] = [];
  const courseByCode = new Map<string, string>();
  for (const r of courseS.rows) {
    const k = code(at(r, C.code)), title = at(r, C.title);
    if (!k || !title) continue;
    if (courseByCode.has(k)) { warnings.push(`Course code ${k} appears twice; the second row was skipped`); continue; }
    const cr = parseInt(at(r, C.cr), 10), sem = parseInt(at(r, C.sem), 10);
    const id = randomUUID();
    courses.push({ id, code: k, title, creditHours: Number.isFinite(cr) ? cr : 3, category: at(r, C.cat) || "Major", domain: at(r, C.dom) || null,
      semesterNumber: Number.isFinite(sem) && sem > 0 ? sem : null, catalogDescription: at(r, C.desc) || null, textbook: at(r, C.tb) || null, referenceMaterial: at(r, C.ref) || null });
    courseByCode.set(k, id);
  }
  if (!courses.length) return { error: "no courses found" };

  // CLOs
  const clos: { masterCourseId: string; statement: string; bloomLevel: string; orderIndex: number; mappedPloId: string | null; ploMappingSource: string | null }[] = [];
  if (cloS) {
    const K = { code: col(cloS, /^course code$|^code$/), st: col(cloS, /^statement$/), bl: col(cloS, /^bloom/), plo: col(cloS, /^(mapped )?(plo|ga)$/) };
    const order = new Map<string, number>();
    for (const r of cloS.rows) {
      const cid = courseByCode.get(code(at(r, K.code)));
      const st = at(r, K.st), bl = at(r, K.bl).toUpperCase().replace(/\s+/g, "");
      if (!cid) { if (at(r, K.code)) warnings.push(`CLO for unknown course ${at(r, K.code)} skipped`); continue; }
      if (!st || !BLOOM.includes(bl)) { warnings.push(`A CLO of ${at(r, K.code)} has no statement or a Bloom level other than C1-C6; skipped`); continue; }
      const n = parseInt(at(r, K.plo).replace(/\D+/g, ""), 10);
      const ploId = Number.isFinite(n) ? ploByNo.get(n) || null : null;
      const i = order.get(cid) || 0; order.set(cid, i + 1);
      clos.push({ masterCourseId: cid, statement: st, bloomLevel: bl, orderIndex: i, mappedPloId: ploId, ploMappingSource: ploId ? "MANUAL" : null });
    }
  }

  // Lecture topics
  const topics: { masterCourseId: string; lectureNumber: number; topic: string; subtopic: string | null; cloNumber: number | null }[] = [];
  if (topicS) {
    const T = { code: col(topicS, /^course code$|^code$/), lec: col(topicS, /^lecture$/), topic: col(topicS, /^topic$/), sub: col(topicS, /^sub ?topic$/), clo: col(topicS, /^(mapped )?clo$/) };
    const seen = new Set<string>();
    for (const r of topicS.rows) {
      const cid = courseByCode.get(code(at(r, T.code)));
      const lec = parseInt(at(r, T.lec), 10), t = at(r, T.topic);
      if (!cid || !Number.isFinite(lec) || !t || seen.has(`${cid}:${lec}`)) continue;
      seen.add(`${cid}:${lec}`);
      const cn = parseInt(at(r, T.clo).replace(/\D+/g, ""), 10);
      topics.push({ masterCourseId: cid, lectureNumber: lec, topic: t, subtopic: at(r, T.sub) || null, cloNumber: Number.isFinite(cn) && cn > 0 ? cn : null });
    }
  }

  const curriculum = await prisma.masterCurriculum.create({
    data: { authority, title: degreeProgram, version, degreeProgram, status: "PUBLISHED", sourceReference: info.get("source") || null, chairmanId: owner.chairmanId },
  });
  await prisma.$transaction([
    prisma.masterPLO.createMany({ data: plos.map((p) => ({ id: p.id, masterCurriculumId: curriculum.id, number: p.number, title: p.title, description: p.description })) }),
    prisma.masterCourse.createMany({ data: courses.map((c) => ({ ...c, masterCurriculumId: curriculum.id })) }),
  ]);
  for (let i = 0; i < clos.length; i += 2000) await prisma.masterCourseClo.createMany({ data: clos.slice(i, i + 2000) });
  for (let i = 0; i < topics.length; i += 3000) await prisma.masterCourseTopic.createMany({ data: topics.slice(i, i + 3000) as never, skipDuplicates: true });

  return { ok: true as const, id: curriculum.id, title: degreeProgram, plos: plos.length, courses: courses.length, clos: clos.length, topics: topics.length, warnings: warnings.slice(0, 20) };
}
