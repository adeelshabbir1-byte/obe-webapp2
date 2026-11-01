// The faculty course-plan workbook: its sheets and columns (with the other names people use for them), reading a
// workbook — the blank template or the person's own sheets, with a remembered column mapping — and checking it.
// No database here (tested on its own).

export type Grid = string[][];
export type Field = { key: string; label: string; aliases: RegExp; required?: boolean; example: string };
export type SheetSpec = { key: PartKey; title: string; aliases: RegExp; fields: Field[]; help: string };
export type PartKey = "course" | "clos" | "lectures" | "assessments" | "items" | "questions";
export const PART_LABEL: Record<PartKey, string> = { course: "Course details", clos: "CLOs", lectures: "Lecture plan", assessments: "Assessment counts and weights", items: "Quiz and assignment topics", questions: "Mid and final questions" };

const F = (key: string, label: string, aliases: RegExp, example: string, required = false): Field => ({ key, label, aliases, example, required });
export const SHEETS: SheetSpec[] = [
  { key: "course", title: "Course info", aliases: /^(course ?info|course details|course|info)$/, help: "One row: the course's description and books.", fields: [
    F("code", "Code", /^(code|course code)$/, "CS-201"), F("title", "Title", /^(title|course title|name)$/, "Data Structures"),
    F("description", "Description", /^(description|catalogue description|catalog description|course description)$/, "Linear and non-linear data structures and their algorithms."),
    F("textbook", "Textbook", /^(textbook|text book|books?|required books?)$/, "Weiss, Data Structures and Algorithm Analysis in C++, 4th ed."),
    F("reference", "Reference", /^(references?|reference books?|reference material)$/, "Cormen et al., Introduction to Algorithms, 3rd ed."),
  ] },
  { key: "clos", title: "CLOs", aliases: /^(clos?|course learning outcomes?|course outcomes?|outcomes)$/, help: "One row per CLO: code, statement, Bloom level (C1–C6, P1–P7, A1–A5) and the GA it maps to.", fields: [
    F("code", "CLO", /^(clo|code|clo code|clo no|no)$/, "CLO-1", true), F("statement", "Statement", /^(statement|clo statement|description|outcome)$/, "Explain the working of stacks, queues and linked lists.", true),
    F("bloom", "Bloom", /^(bloom|bloom level|bloom s level|domain level|level|taxonomy|cognitive|cognitive level)$/, "C2", true), F("ga", "GA", /^(ga|plo|ga plo|mapped ga|mapped plo|graduate attribute)$/, "GA-2"),
  ] },
  { key: "lectures", title: "Lecture plan", aliases: /^(lecture plan|lecture topics|lectures|weekly plan|plan|topics)$/, help: "One row per lecture: number, week, topic, sub-topics and its CLO.", fields: [
    F("lecture", "Lecture", /^(lecture|lec|lecture no|lecture number|lecture #|l)$/, "1", true), F("week", "Week", /^(week|wk|week no)$/, "1"),
    F("topic", "Topic", /^(topic|topics|main topic)$/, "Introduction to data structures", true), F("subtopic", "Sub-topic", /^(sub ?topics?|details|subtopic)$/, "ADTs; arrays vs lists"), F("clo", "CLO", /^(clo|mapped clo|clo code)$/, "CLO-1"),
  ] },
  { key: "assessments", title: "Assessments", aliases: /^(assessments?|assessment counts?|weights|assessment plan|marks distribution)$/, help: "One row per kind: how many and its total weight in % (the weights add up to 100).", fields: [
    F("type", "Type", /^(type|assessment|kind|assessment type)$/, "Quiz", true), F("count", "Count", /^(count|number|no|how many|quantity)$/, "4", true), F("weight", "Weight %", /^(weight|weight %|weightage|%|percentage|marks %)$/, "10", true),
  ] },
  { key: "items", title: "Quiz and assignment topics", aliases: /^(quiz (and|&) assignment topics|quizzes? (and|&) assignments?|items|quiz topics|assignment topics)$/, help: "One row per quiz or assignment: its number, the lectures it covers and its CLO.", fields: [
    F("type", "Type", /^(type|assessment|kind)$/, "Quiz", true), F("no", "No.", /^(no|number|n|#)$/, "1", true), F("lectures", "Lectures", /^(lectures?|lecture nos?|topics? lectures?|covers)$/, "2, 3"),
    F("clo", "CLO", /^(clo|mapped clo)$/, "CLO-1"), F("max", "Out of", /^(out of|max|max marks|total marks|marks)$/, "10"),
  ] },
  { key: "questions", title: "Mid and final questions", aliases: /^(mid (and|&) final questions|exam questions|questions|paper distribution|mid final)$/, help: "One row per question of the midterm and final paper: CLO, marks, topic and Bloom level.", fields: [
    F("exam", "Exam", /^(exam|paper|exam type)$/, "Final", true), F("q", "Q", /^(q|question|q no|question no|#)$/, "1", true), F("clo", "CLO", /^(clo|mapped clo)$/, "CLO-3", true),
    F("marks", "Marks", /^(marks|mark|max marks|out of)$/, "10", true), F("topic", "Topic", /^(topic|topics|from topic|lecture topic)$/, "Binary search trees"), F("bloom", "Bloom", /^(bloom|level|cognitive level)$/, "C3"),
  ] },
];

export const norm = (s: string | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
/** A remembered mapping: sheet → the sheet's name in the person's file, and field → the column's heading there. */
export type Mapping = Partial<Record<PartKey, { sheet?: string; columns?: Record<string, string> }>>;

export type Parsed = {
  course: { code?: string; title?: string; description?: string; textbook?: string; reference?: string } | null;
  clos: { code: string; statement: string; bloom: string; ga: number | null }[];
  lectures: { lecture: number; week: number; topic: string; subtopic: string | null; clo: string | null }[];
  assessments: { type: string; count: number; weight: number }[];
  items: { type: string; no: number; lectures: number[]; clo: string | null; max: number | null }[];
  questions: { exam: "Midterm" | "Final"; q: number; clo: string; marks: number | null; topic: string | null; bloom: string | null }[];
  found: Partial<Record<PartKey, string>>; unmatched: { part: PartKey; sheet: string; missing: string[]; headings: string[] }[];
};

const TYPES: Record<string, string> = { quiz: "Quiz", quizzes: "Quiz", assignment: "Assignment", assignments: "Assignment", project: "Project", projects: "Project", lab: "Lab", labs: "Lab", mid: "Midterm", midterm: "Midterm", "mid term": "Midterm", final: "Final", "final exam": "Final", finals: "Final" };
export const typeOf = (s: string) => TYPES[norm(s)] || null;
export const cloKey = (s: string | null | undefined) => { const n = parseInt(String(s || "").replace(/\D+/g, ""), 10); return Number.isFinite(n) ? `CLO-${n}` : null; };
const num = (s: string | undefined) => { const n = parseFloat(String(s ?? "").replace(/[%, ]/g, "")); return Number.isFinite(n) ? n : null; };

/** Reads the workbook's sheets (by name, or as mapped), with each column found by its heading (or as mapped). */
export function parseWorkbook(sheets: { name: string; grid: Grid }[], mapping: Mapping = {}): Parsed {
  const out: Parsed = { course: null, clos: [], lectures: [], assessments: [], items: [], questions: [], found: {}, unmatched: [] };
  for (const spec of SHEETS) {
    const m = mapping[spec.key] || {};
    const sheet = (m.sheet && sheets.find((s) => norm(s.name) === norm(m.sheet))) || sheets.find((s) => spec.aliases.test(norm(s.name)));
    if (!sheet) continue;
    // The heading row: the first of the first 10 rows naming every required column (by alias or by the mapping).
    const colIn = (row: string[], f: Field) => { const mapped = m.columns?.[f.key]; return row.findIndex((c) => (mapped ? norm(c) === norm(mapped) : f.aliases.test(norm(c)))); };
    const need = spec.fields.filter((f) => f.required);
    let hi = -1;
    for (let r = 0; r < Math.min(10, sheet.grid.length) && hi < 0; r++) if (need.every((f) => colIn(sheet.grid[r] || [], f) >= 0) && (need.length || spec.fields.some((f) => colIn(sheet.grid[r] || [], f) >= 0))) hi = r;
    if (hi < 0) {
      const best = sheet.grid.slice(0, 10).sort((a, b) => b.filter(Boolean).length - a.filter(Boolean).length)[0] || [];
      out.unmatched.push({ part: spec.key, sheet: sheet.name, missing: need.filter((f) => colIn(best, f) < 0).map((f) => f.label), headings: best.filter(Boolean) });
      continue;
    }
    out.found[spec.key] = sheet.name;
    const idx = Object.fromEntries(spec.fields.map((f) => [f.key, colIn(sheet.grid[hi], f)]));
    const at = (row: string[], k: string) => (idx[k] >= 0 ? (row[idx[k]] || "").trim() : "");
    const rows = sheet.grid.slice(hi + 1).filter((r) => r.some((c) => (c || "").trim()));
    if (spec.key === "course") { const r = rows[0] || []; out.course = { code: at(r, "code") || undefined, title: at(r, "title") || undefined, description: at(r, "description") || undefined, textbook: at(r, "textbook") || undefined, reference: at(r, "reference") || undefined }; }
    if (spec.key === "clos") for (const r of rows) { const code = cloKey(at(r, "code")); if (!code) continue; const g = parseInt(at(r, "ga").replace(/\D+/g, ""), 10); out.clos.push({ code, statement: at(r, "statement"), bloom: at(r, "bloom").toUpperCase(), ga: Number.isFinite(g) ? g : null }); }
    if (spec.key === "lectures") for (const r of rows) { const n = parseInt(at(r, "lecture"), 10); if (!Number.isFinite(n)) continue; const w = parseInt(at(r, "week"), 10); out.lectures.push({ lecture: n, week: Number.isFinite(w) && w > 0 ? w : Math.ceil(n / 2), topic: at(r, "topic"), subtopic: at(r, "subtopic") || null, clo: at(r, "clo") ? cloKey(at(r, "clo")) || at(r, "clo") : null }); }
    if (spec.key === "assessments") for (const r of rows) { const t = typeOf(at(r, "type")); if (!t) continue; out.assessments.push({ type: t, count: Math.max(0, Math.round(num(at(r, "count")) ?? 0)), weight: num(at(r, "weight")) ?? 0 }); }
    if (spec.key === "items") for (const r of rows) { const t = typeOf(at(r, "type")); const n = parseInt(at(r, "no"), 10); if (!t || !Number.isFinite(n)) continue; out.items.push({ type: t, no: n, lectures: at(r, "lectures").split(/[^0-9]+/).map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x) && x > 0), clo: at(r, "clo") ? cloKey(at(r, "clo")) || at(r, "clo") : null, max: num(at(r, "max")) }); }
    if (spec.key === "questions") for (const r of rows) { const t = typeOf(at(r, "exam")); const q = parseInt(at(r, "q").replace(/\D+/g, ""), 10); if ((t !== "Midterm" && t !== "Final") || !Number.isFinite(q)) continue; out.questions.push({ exam: t, q, clo: at(r, "clo") ? cloKey(at(r, "clo")) || at(r, "clo") : "", marks: num(at(r, "marks")), topic: at(r, "topic") || null, bloom: at(r, "bloom") ? at(r, "bloom").toUpperCase() : null }); }
  }
  return out;
}

const BLOOM = /^(C[1-6]|P[1-7]|A[1-5])$/;
/** What is missing or invalid (nothing is saved while any part the person picked has a problem). */
export function checkWorkbook(p: Parsed, ctx: { existingClos: string[]; gaNumbers: number[] }): Record<PartKey, string[]> {
  const out: Record<PartKey, string[]> = { course: [], clos: [], lectures: [], assessments: [], items: [], questions: [] };
  const clos = new Set([...ctx.existingClos, ...p.clos.map((c) => c.code)]);
  const seenC = new Set<string>();
  for (const c of p.clos) {
    if (seenC.has(c.code)) out.clos.push(`${c.code} appears twice`); seenC.add(c.code);
    if (!c.statement) out.clos.push(`${c.code}: no statement`);
    if (!BLOOM.test(c.bloom)) out.clos.push(`${c.code}: Bloom level "${c.bloom || "blank"}" is not C1–C6, P1–P7 or A1–A5`);
    if (c.ga !== null && !ctx.gaNumbers.includes(c.ga)) out.clos.push(`GA-${c.ga} is not one of this batch's GAs`);
  }
  const seenL = new Set<number>();
  for (const l of p.lectures) {
    if (seenL.has(l.lecture)) out.lectures.push(`Lecture ${l.lecture} appears twice`); seenL.add(l.lecture);
    if (!l.topic) out.lectures.push(`Lecture ${l.lecture}: no topic`);
    if (l.clo && !clos.has(l.clo)) out.lectures.push(`Lecture ${l.lecture}: ${l.clo} does not exist`);
  }
  if (p.assessments.length) { const t = Math.round(p.assessments.reduce((s, a) => s + a.weight, 0) * 100) / 100; if (t !== 100) out.assessments.push(`The weights add up to ${t}%, not 100%`); }
  for (const i of p.items) {
    if (i.clo && !clos.has(i.clo)) out.items.push(`${i.type} ${i.no}: ${i.clo} does not exist`);
    for (const n of i.lectures) if (p.lectures.length && !seenL.has(n)) out.items.push(`${i.type} ${i.no}: lecture ${n} is not in the plan`);
  }
  for (const q of p.questions) {
    const name = `${q.exam === "Final" ? "Final" : "Mid"} Q${q.q}`;
    if (!q.clo) out.questions.push(`${name}: no CLO`); else if (!clos.has(q.clo)) out.questions.push(`${name}: ${q.clo} does not exist`);
    if (q.marks === null || q.marks <= 0) out.questions.push(`${name}: no marks`);
  }
  return out;
}
export const counts = (p: Parsed) => ({ clos: p.clos.length, lectures: p.lectures.length, quizzes: p.items.filter((i) => i.type === "Quiz").length || p.assessments.find((a) => a.type === "Quiz")?.count || 0, assignments: p.items.filter((i) => i.type === "Assignment").length || p.assessments.find((a) => a.type === "Assignment")?.count || 0, mid: p.questions.filter((q) => q.exam === "Midterm").length, final: p.questions.filter((q) => q.exam === "Final").length });
export const countsLine = (c: ReturnType<typeof counts>) => `CLOs ${c.clos} · lectures ${c.lectures} · quizzes ${c.quizzes} · assignments ${c.assignments} · mid questions ${c.mid} · final questions ${c.final}`;
