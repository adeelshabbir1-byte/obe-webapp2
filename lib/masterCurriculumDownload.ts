import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, PageBreak } from "docx";
import { prisma } from "./db";
import { officialCurriculumIsAssigned } from "./curriculumAccess";
import type { SheetSpec } from "./excelExport";

// Full download of one master curriculum: PLOs, scheme of studies, course details, CLOs with PLOs, Course–PLO matrix
// and the lecture-by-lecture topics. Excel (one sheet per part) or Word (a readable curriculum document).

type Who = { id: string; role: string; managedById: string | null };

/** The curriculum, if this person may see it: Super User any; Institute Head / OMC their own copy or an official one assigned to their institute. */
export async function loadCurriculumForDownload(user: Who, id: string) {
  if (!["SUPER_USER", "CHAIRMAN", "OMC"].includes(user.role)) return null;
  const c = await prisma.masterCurriculum.findUnique({
    where: { id },
    include: {
      plos: { orderBy: { number: "asc" } },
      courses: {
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
        include: {
          seedClos: { orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true } } } },
          seedTopics: { orderBy: { lectureNumber: "asc" } },
          prerequisiteCourse: { select: { code: true, title: true } },
        },
      },
    },
  });
  if (!c) return null;
  if (user.role === "SUPER_USER") return c;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById;
  const ok = c.chairmanId === null ? await officialCurriculumIsAssigned(c.id, chairmanId) : c.chairmanId === chairmanId;
  return ok ? c : null;
}
type Curriculum = NonNullable<Awaited<ReturnType<typeof loadCurriculumForDownload>>>;

export const fileBase = (c: Curriculum) => `${c.authority}-${c.title}-${c.version}`.replace(/[^A-Za-z0-9._-]+/g, "_");
const semLabel = (n: number | null) => (n ? `Semester ${n}` : "Electives / not placed in a semester");
const coursePlos = (k: Curriculum["courses"][number]) => Array.from(new Set(k.seedClos.map((l) => l.mappedPlo?.number).filter((n): n is number => n != null))).sort((a, b) => a - b);

export function curriculumSheets(c: Curriculum): SheetSpec[] {
  return [
    { name: "Courses", columns: [
      { header: "Semester", key: "sem", width: 10 }, { header: "Code", key: "code", width: 11 }, { header: "Title", key: "title", width: 42 }, { header: "Credit hours", key: "cr", width: 11 },
      { header: "Category", key: "cat", width: 20 }, { header: "Domain", key: "dom", width: 18 }, { header: "Prerequisite", key: "pre", width: 13 }, { header: "CLOs", key: "nclo", width: 7 },
      { header: "PLOs", key: "plos", width: 20 }, { header: "Lecture topics", key: "ntop", width: 13 }, { header: "Description", key: "desc", width: 60 }, { header: "Textbook", key: "tb", width: 40 }, { header: "Reference material", key: "ref", width: 40 },
    ], rows: c.courses.map((k) => ({ sem: k.semesterNumber ?? "", code: k.code, title: k.title, cr: k.creditHours, cat: k.category, dom: k.domain || "", pre: k.prerequisiteCourse?.code || "", nclo: k.seedClos.length, plos: coursePlos(k).map((n) => `PLO-${n}`).join(", "), ntop: k.seedTopics.length, desc: k.catalogDescription || "", tb: k.textbook || "", ref: k.referenceMaterial || "" })) },
    { name: "CLOs and PLO mapping", columns: [
      { header: "Course code", key: "code", width: 12 }, { header: "Course title", key: "title", width: 36 }, { header: "CLO", key: "clo", width: 8 },
      { header: "Statement", key: "st", width: 70 }, { header: "Bloom level", key: "bl", width: 10 }, { header: "Mapped PLO", key: "plo", width: 11 },
    ], rows: c.courses.flatMap((k) => k.seedClos.map((l, i) => ({ code: k.code, title: k.title, clo: `CLO-${i + 1}`, st: l.statement, bl: l.bloomLevel, plo: l.mappedPlo ? `PLO-${l.mappedPlo.number}` : "" }))) },
    { name: "Course-PLO matrix", columns: [
      { header: "Code", key: "code", width: 11 }, { header: "Title", key: "title", width: 40 }, { header: "Semester", key: "sem", width: 10 },
      ...c.plos.map((p) => ({ header: `PLO-${p.number}`, key: `p${p.number}`, width: 8 })),
    ], rows: c.courses.map((k) => { const ps = coursePlos(k); return { code: k.code, title: k.title, sem: k.semesterNumber ?? "", ...Object.fromEntries(c.plos.map((p) => [`p${p.number}`, ps.includes(p.number) ? "X" : ""])) }; }) },
    { name: "Lecture topics", columns: [
      { header: "Course code", key: "code", width: 12 }, { header: "Course title", key: "title", width: 36 }, { header: "Week", key: "wk", width: 7 }, { header: "Lecture", key: "lec", width: 8 },
      { header: "Topic", key: "topic", width: 60 }, { header: "Subtopic", key: "sub", width: 50 },
    ], rows: c.courses.flatMap((k) => k.seedTopics.map((t) => ({ code: k.code, title: k.title, wk: Math.ceil(t.lectureNumber / 2), lec: t.lectureNumber, topic: t.topic, sub: t.subtopic || "" }))) },
    { name: "PLOs", columns: [{ header: "PLO", key: "n", width: 8 }, { header: "Title", key: "t", width: 40 }, { header: "Description", key: "d", width: 90 }], rows: c.plos.map((p) => ({ n: `PLO-${p.number}`, t: p.title, d: p.description })) },
  ];
}

// ---- Word ----
const CONTENT = 12240 - 1440 * 2;
const cell = (text: string, o: { bold?: boolean; w?: number; shade?: string } = {}) => new TableCell({
  width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
  shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text: text || "—", bold: !!o.bold, size: 19 })] })],
});
function table(head: string[], widths: number[], rows: string[][]) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, w: widths[i], shade: "EFEADC" })) }), ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { w: widths[i] })) }))],
  });
}
const p = (text: string, o: { bold?: boolean; size?: number; italics?: boolean } = {}) => new Paragraph({ spacing: { before: o.bold ? 160 : 0, after: 80 }, children: [new TextRun({ text, bold: o.bold, size: o.size || 21, italics: o.italics })] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ heading: level, spacing: { before: 200, after: 100 }, children: [new TextRun({ text })] });

export function curriculumDocument(c: Curriculum) {
  const body: (Paragraph | Table)[] = [];
  body.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${c.title}` })] }));
  body.push(p(`${c.authority} curriculum, version ${c.version}${c.sourceReference ? ` — ${c.sourceReference}` : ""}`, { italics: true }));
  const totalCr = c.courses.filter((k) => k.semesterNumber).reduce((s, k) => s + k.creditHours, 0);
  body.push(p(`${c.courses.length} courses · ${c.plos.length} PLOs · ${totalCr} credit hours placed in semesters`));

  body.push(h("Program Learning Outcomes", HeadingLevel.HEADING_1));
  body.push(table(["PLO", "Title", "Description"], [900, 2600, CONTENT - 3500], c.plos.map((x) => [`PLO-${x.number}`, x.title, x.description])));

  body.push(h("Scheme of Studies", HeadingLevel.HEADING_1));
  const sems = Array.from(new Set(c.courses.map((k) => k.semesterNumber))).sort((a, b) => (a ?? 99) - (b ?? 99));
  for (const s of sems) {
    const list = c.courses.filter((k) => k.semesterNumber === s);
    body.push(h(`${semLabel(s)} (${list.reduce((n, k) => n + k.creditHours, 0)} credit hours)`, HeadingLevel.HEADING_3));
    body.push(table(["Code", "Course", "Cr", "Category", "Prerequisite", "PLOs"], [1000, 3300, 500, 1600, 1500, CONTENT - 7900],
      list.map((k) => [k.code, k.title, String(k.creditHours), k.category + (k.domain ? ` (${k.domain})` : ""), k.prerequisiteCourse?.code || "", coursePlos(k).map((n) => `PLO-${n}`).join(", ")])));
  }

  body.push(new Paragraph({ children: [new PageBreak()] }));
  body.push(h("Course Details", HeadingLevel.HEADING_1));
  c.courses.forEach((k, idx) => {
    if (idx > 0) body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(h(`${k.code} — ${k.title}`, HeadingLevel.HEADING_2));
    body.push(p(`${k.creditHours} credit hours · ${k.category}${k.domain ? ` (${k.domain})` : ""} · ${semLabel(k.semesterNumber)}${k.prerequisiteCourse ? ` · Prerequisite: ${k.prerequisiteCourse.code} ${k.prerequisiteCourse.title}` : ""}`));
    if (k.catalogDescription) { body.push(p("Course description", { bold: true })); body.push(p(k.catalogDescription)); }
    if (k.seedClos.length) {
      body.push(p("Course Learning Outcomes", { bold: true }));
      body.push(table(["CLO", "Statement", "Bloom", "PLO"], [900, CONTENT - 2900, 1000, 1000], k.seedClos.map((l, i) => [`CLO-${i + 1}`, l.statement, l.bloomLevel, l.mappedPlo ? `PLO-${l.mappedPlo.number}` : ""])));
    }
    if (k.seedTopics.length) {
      body.push(p("Weekly topics", { bold: true }));
      body.push(table(["Week", "Lecture", "Topic"], [900, 1100, CONTENT - 2000], k.seedTopics.map((t) => [String(Math.ceil(t.lectureNumber / 2)), String(t.lectureNumber), t.topic + (t.subtopic ? ` — ${t.subtopic}` : "")])));
    }
    if (k.textbook) { body.push(p("Textbook", { bold: true })); body.push(p(k.textbook)); }
    if (k.referenceMaterial) { body.push(p("Reference material", { bold: true })); body.push(p(k.referenceMaterial)); }
  });
  return new Document({
    styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 } } }, children: body }],
  });
}
