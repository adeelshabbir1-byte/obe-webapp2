import { CD2023_COURSES, CD2023_PLOS } from "./computing2023Content";
import { CD2023_BOOKS } from "./computing2023Books";
import { HEC_BSCS_2025_COURSES } from "../prisma/hec-bscs-2025";
import { HEC_COURSE_SEED_CONTENT } from "../prisma/hec-course-seed-content";
import { HEC_GE_IDS_SEED_CONTENT } from "../prisma/hec-ge-ids-seed-content";
import { PU_BSCS_2021 } from "./puBscs2021";
import { BBA_SCHEME, BBA_PLOS } from "./demoBba";
import { BBA_CONTENT } from "./demoBbaContent";
import { CLO_FILL, EXTRA_COURSES } from "./catalogExtra";
import { mapLectures, suggestPlo, titleKey } from "./curriculumContent";
import {
  FIELDS, isGeneric, levelOf, makeCode, topicSimilarity, tokens,
  type CatBook, type CatClo, type CatLecture, type CatPrereq, type CatTopicLink, type CatalogEntry, type Field, type Importance, type Strength,
} from "./catalogCore";

// The Course Catalog's starting content, built from what is already in the system:
//  - Computing: HEC/NCEAC Computing Disciplines 2023 outlines (CLOs as the council lists them) and the HEC BS CS 2025
//    scheme (semesters, CLOs; lecture plans drafted from published syllabi), PU BSCS 2021 codes and semesters.
//  - Management Sciences: the HEC BBA scheme used by the demo institute, with OBEHUB-written CLOs and plans.
//  - Engineering, and standard courses missing above: lib/catalogExtra.ts.
// Only the CLO wording of the council documents is council text; everything OBEHUB worked out (GA mapping, lecture
// plans, importance, book chapters, prerequisite strengths) is marked "OBEHUB reference" and stays editable.

export const GA_SETS: Record<"CGA" | "BGA" | "EGA", { label: string; source: string; items: { n: number; title: string; description: string }[] }> = {
  CGA: { label: "Computing graduate attributes (Seoul Accord PLOs, HEC/NCEAC 2023)", source: "HEC/NCEAC Computing Disciplines 2023", items: CD2023_PLOS.map((p) => ({ n: p.number, title: p.title, description: p.description })) },
  BGA: { label: "Business graduate attributes", source: "OBEHUB reference (HEC's BBA scheme states no PLOs)", items: BBA_PLOS.map((p, i) => { const [t, ...d] = p.split(": "); return { n: i + 1, title: t, description: d.join(": ") }; }) },
  EGA: { label: "Engineering graduate attributes (PEC / Washington Accord)", source: "PEC graduate attribute names; descriptions are OBEHUB summaries", items: [
    ["Engineering Knowledge", "Apply knowledge of mathematics, science and engineering fundamentals to complex problems."],
    ["Problem Analysis", "Identify, formulate and analyse complex engineering problems to reach substantiated conclusions."],
    ["Design/Development of Solutions", "Design solutions and systems that meet needs with regard to safety, culture, society and environment."],
    ["Investigation", "Investigate complex problems through experiments, analysis and interpretation of data."],
    ["Modern Tool Usage", "Select and apply appropriate techniques, resources and modern engineering and IT tools."],
    ["The Engineer and Society", "Assess societal, health, safety, legal and cultural issues relevant to engineering practice."],
    ["Environment and Sustainability", "Understand the impact of engineering solutions on the environment and the need for sustainable development."],
    ["Ethics", "Apply ethical principles and commit to professional ethics and responsibilities."],
    ["Individual and Team Work", "Work effectively as an individual and as a member or leader of diverse teams."],
    ["Communication", "Communicate effectively on engineering activities in writing and speech."],
    ["Project Management", "Apply engineering management principles and economic decision making to projects."],
    ["Lifelong Learning", "Recognise the need for, and engage in, independent and life-long learning."],
  ].map(([t, d], i) => ({ n: i + 1, title: t, description: d })) },
};

const REF = "OBEHUB reference";
const SEED = { ...HEC_COURSE_SEED_CONTENT, ...HEC_GE_IDS_SEED_CONTENT } as Record<string, { clos: { statement: string; bloomLevel: string }[]; topics: string[] }>;
/** Same course under two documents' titles. */
const ALIAS: Record<string, string> = {
  "calculus and analytical geometry": "Calculus and Analytic Geometry", "calculu and analytical geometry": "Calculus and Analytic Geometry",
  "linear algebra": "Linear Algebra", "database systems": "Database System", "database system": "Database System",
  "design and analysis of algorithms": "Analysis of Algorithms", "theory of automata": "Theory of Automata & Formal Languages",
  "applications of information and communication technologies": "Introduction to Information and Communication Technologies",
  "islamic studies": "Islamic Studies", "discrete structures": "Discrete Structure", "discrete mathematics": "Discrete Structure",
  "artificial neural networks and deep learning": "Artificial Neural Networks & Deep Learning", "data warehousing and business intelligence": "Data Warehousing and Business Intelligence",
  "advance database management systems": "Advance Database Management Systems", "computer organization and assembly language": "Computer Organization and Assembly Language",
};
const clean = (t: string) => t.replace(/\s*\((IDS|Religious|for )[^)]*\)\s*/gi, " ").replace(/\s+/g, " ").trim();
const keyOf = (t: string) => { const c = clean(t); const k = titleKey(c); const a = ALIAS[c.toLowerCase().replace(/&/g, "and")] || ALIAS[k]; return titleKey(a || c); };

const AREA_RULES: Record<Field, [RegExp, number][]> = {
  COMPUTING: [[/english|writing|islamic|pakistan|ideology|quran|social science|humanities|civics|professional practice|entrepreneur|communication/i, 9], [/calculus|algebra|probability|statistic|physics|quantitative|discrete|natural science/i, 8], [/software (engineering|requirement|design|project)|human computer|secure software/i, 7], [/artificial|machine learning|neural|deep learning|vision|natural language|knowledge representation/i, 6], [/data|database|warehous|mining|big data/i, 5], [/network|security|cyber|forensic|assurance|vulnerab|cloud/i, 4], [/logic design|organization|architecture|operating|parallel|assembly/i, 3], [/algorithm|automata|compiler|theory/i, 2], [/programming|object oriented|web|mobile/i, 1], [/./, 0]],
  MANAGEMENT: [[/^(ACC|CMA)/, 1], [/^(FIN|BNK)/, 2], [/^(MKT|CRM)/, 3], [/^(HRM|ORG|LDR)/, 4], [/^(OPM|SCM|PMG)/, 5], [/^ECO/, 6], [/^(MIS|ICT|BA)/, 7], [/^(STA|MTH|RES)/, 8], [/^(ENG|ISL|PKS|BLW|BET|PRJ|INT|PSY)/, 9], [/./, 0]],
  ENGINEERING: [[/./, 0]],
};
const areaOf = (field: Field, s: string) => AREA_RULES[field].find(([re]) => re.test(s))![1];
const DISC: [RegExp, string][] = [
  [/neural|vision|knowledge representation|machine learning|natural language|programming for artificial|deep learning/i, "Artificial Intelligence"],
  [/advance statistics|big data|data mining|data visualization|warehousing|data science|advance database/i, "Data Science"],
  [/forensic|information assurance|cyber|network security|secure software|vulnerab/i, "Cyber Security"],
  [/english|writing|islamic|pakistan|ideology|quran|social science|humanities|civics|entrepreneur|quantitative reasoning|natural science|applied physics/i, "General Education"],
  [/calculus|linear algebra|probability|discrete/i, "Mathematics"],
];
const discOf = (t: string) => DISC.find(([re]) => re.test(t))?.[1] || "Computing core";
const BBA_DISC = (code: string) => (/^(ACC|CMA|FIN|BNK)/.test(code) ? "Accounting & Finance" : /^(MKT|CRM)/.test(code) ? "Marketing" : /^(HRM|ORG|LDR)/.test(code) ? "Human Resource Management" : /^(SCM|OPM)/.test(code) ? "Supply Chain Management" : /^(MIS|ICT)/.test(code) ? "Business Analytics" : /^(ENG|ISL|PKS|MTH|PSY)/.test(code) ? "General Education" : "Business Administration");

/** "4 (3-3)" → 4 credit hours, 3 theory, 1 lab; "2-1" → 3, 2, 1. */
export function parseCh(ch: string, lab: number) {
  const m = /^(\d)\s*\((\d)\s*-\s*(\d)\)/.exec(ch);
  if (m) return { ch: Number(m[1]), theory: Number(m[2]), lab: Number(m[1]) - Number(m[2]) };
  const n = /^(\d)\s*-\s*(\d)$/.exec(ch.trim());
  if (n) return { ch: Number(n[1]) + Number(n[2]), theory: Number(n[1]), lab: Number(n[2]) };
  const c = Number(ch) || 3;
  return { ch: c, theory: lab ? c - 1 : c, lab: lab ? 1 : 0 };
}
/** "Linked Lists - Singly" → topic and sub-topic. */
const balance = (t: string) => ((t.match(/\(/g) || []).length === (t.match(/\)/g) || []).length ? t : t.replace(/[()]/g, " ")).replace(/\s+/g, " ").trim();
export function splitTopic(t: string): { topic: string; sub: string } {
  let s = t.replace(/\s+/g, " ").trim();
  const open = s.indexOf("(");
  if (open > 2 && (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) return { topic: balance(s.slice(0, open)), sub: balance(s.slice(open + 1)) };
  s = balance(s);
  const m = /^(.+?)\s+[-–—:]\s+(.+)$/.exec(s) || /^(.+?)\s*\((.+)\)\s*$/.exec(s) || /^(.+?);\s*(.+)$/.exec(s);
  if (m && m[1].length > 2) return { topic: balance(m[1].trim()), sub: balance(m[2].trim()) };
  return { topic: s, sub: "" };
}
const gaFor = (set: "CGA" | "BGA" | "EGA", statement: string, bloom: string): number[] => {
  const s = statement.toLowerCase();
  if (set === "CGA") return [suggestPlo(statement, bloom)];
  if (set === "BGA") {
    if (/communicat|present|report|writ/.test(s)) return [3];
    if (/ethic|responsib|islamic/.test(s)) return [4];
    if (/team|lead/.test(s)) return [5];
    if (/technolog|software|spreadsheet|information system|digital|python/.test(s)) return [6];
    if (/global|international/.test(s)) return [7];
    if (/entrepreneur|opportunit|venture/.test(s)) return [8];
    return /analy|evaluat|calculat|assess|compar|interpret/.test(s) || ["C4", "C5", "C6"].includes(bloom) ? [2] : [1];
  }
  if (/team/.test(s)) return [9];
  if (/communicat|report|present/.test(s)) return [10];
  if (/ethic/.test(s)) return [8];
  if (/environment|sustainab/.test(s)) return [7];
  if (/societ|safety|legal/.test(s)) return [6];
  if (/cost|econom|project|alternatives/.test(s)) return [11];
  if (/laborator|measur|test|experiment/.test(s)) return [4];
  if (/software|simulat|cad|tools?\b/.test(s)) return [5];
  if (/design/.test(s) || bloom === "C6") return [3];
  if (["C4", "C5"].includes(bloom)) return [2];
  return [1];
};

type Raw = {
  field: Field; discipline: string; area: number; title: string; ch: number; theory: number; lab: number; semester: number | null; semesterReason: string | null;
  source: string; sourceNote: string; instituteCodes: { code: string; of: string }[]; clos: { statement: string; bloom: string; source: string }[];
  plan: { topic: string; sub: string }[]; pre: { title: string; strength: Strength; reason: string }[]; books: CatBook[];
};

/** 15 topics → 32 lectures: two lectures each, lecture 16 the mid-term review and 32 the final review. */
function planFrom15(topics: { topic: string; subs: [string, string] }[]) {
  const out: { topic: string; sub: string }[] = [];
  for (let n = 1; n <= 32; n++) {
    if (n === 16) { out.push({ topic: "Mid-term review", sub: "Revision of lectures 1–15" }); continue; }
    if (n === 32) { out.push({ topic: "Final review", sub: "Revision of the course" }); continue; }
    const k = n < 16 ? n : n - 1;
    const t = topics[Math.min(topics.length - 1, Math.floor((k - 1) / 2))];
    out.push({ topic: t.topic, sub: t.subs[(k - 1) % 2] });
  }
  return out;
}
const plan32 = (topics: string[]) => {
  const xs = topics.slice(0, 32).map(splitTopic);
  while (xs.length < 32) xs.push({ topic: xs.length === 15 ? "Mid-term review" : "Final review", sub: "Revision" });
  return xs.map((x, i) => {
    const cont = /\(?\bcontinued\)?\s*$/i.test(x.topic);
    const topic = x.topic.replace(/\s*\(?\bcontinued\)?\s*$/i, "").trim() || x.topic;
    return { topic, sub: x.sub || (cont ? "Continued" : i % 2 ? "Practice and problems" : "Concepts and worked examples") };
  });
};

function computingRaws(): Raw[] {
  const out = new Map<string, Raw>();
  const pu = new Map<string, (typeof PU_BSCS_2021)[number]>();
  for (const c of PU_BSCS_2021) for (const t of [c.title, c.nceac2023, c.hec2025]) if (t) pu.set(keyOf(t), c);
  const hec = new Map(HEC_BSCS_2025_COURSES.map((c) => [keyOf(c.title), c]));
  const add = (title: string) => {
    const k = keyOf(title);
    if (!out.has(k)) out.set(k, { field: "COMPUTING", discipline: discOf(title), area: areaOf("COMPUTING", title), title: clean(title), ch: 3, theory: 3, lab: 0, semester: null, semesterReason: null, source: "", sourceNote: "", instituteCodes: [], clos: [], plan: [], pre: [], books: [] });
    return out.get(k)!;
  };
  for (const [title, c] of Object.entries(CD2023_COURSES)) {
    const r = add(title), x = parseCh(c.ch, c.lab);
    Object.assign(r, { ch: x.ch, theory: x.theory, lab: x.lab, source: "HEC/NCEAC 2023" });
    if (c.clos.length) r.clos = c.clos.map((y) => ({ statement: y.s, bloom: y.b, source: "HEC/NCEAC Computing 2023" }));
    else if (CLO_FILL[title]) r.clos = CLO_FILL[title].split(";;").map((x) => { const [st, b] = x.split("|").map((y) => y.trim()); return { statement: st, bloom: b, source: REF }; });
    if (c.topics.length) { r.plan = plan32(c.topics); r.sourceNote = "Lecture plan derived by OBEHUB from the 2023 course outline."; }
    for (const p of (c.pre || "").split(/,\s*/).filter((p) => p && !/^(none|nil|-)$/i.test(p))) r.pre.push({ title: p, strength: "STRONG", reason: "Prerequisite listed in the HEC/NCEAC 2023 outline." });
    const b = CD2023_BOOKS[title];
    if (b) r.books = [...(b.textbook ? [{ title: b.textbook, kind: "TEXT" as const }] : []), ...b.references.map((t) => ({ title: t, kind: "REFERENCE" as const }))];
  }
  for (const c of HEC_BSCS_2025_COURSES) {
    const s = SEED[c.code];
    if (!s?.topics.length) continue;
    const r = add(c.title);
    r.instituteCodes.push({ code: c.code, of: "HEC BS CS 2025 (suggested)" });
    r.semester = c.semesterNumber; r.semesterReason = `Semester ${c.semesterNumber} in the HEC BS Computer Science 2025 scheme.`;
    if (!r.source) { r.source = "HEC BS CS 2025"; r.ch = c.creditHours; r.theory = c.creditHours; }
    if (!r.clos.length) r.clos = s.clos.map((y) => ({ statement: y.statement, bloom: y.bloomLevel, source: "HEC BS CS 2025" }));
    r.plan = plan32(s.topics); r.sourceNote = "Lecture plan: OBEHUB draft from published university syllabi (HEC leaves course contents to departments).";
  }
  for (const r of Array.from(out.values())) {
    const p = pu.get(keyOf(r.title));
    if (p) {
      r.instituteCodes.push({ code: p.code, of: "PU BSCS 2021" });
      if (!r.semester) { r.semester = p.semester; r.semesterReason = `Semester ${p.semester} in the Punjab University BSCS 2021 scheme.`; }
      if (!r.books.length && p.textbook) r.books = [{ title: p.textbook.split(/\n/)[0].slice(0, 300), kind: "TEXT" }];
    }
  }
  return Array.from(out.values());
}

function managementRaws(): Raw[] {
  const pre: Record<string, string[]> = { ACC102: ["ACC101"], ECO102: ["ECO101"], ENG102: ["ENG101"], STA201: ["MTH101"], FIN301: ["ACC102"], CMA301: ["ACC102"], ORG301: ["MGT101"], FIN402: ["FIN301"], MKT402: ["MKT201"], HRM401: ["MGT101"], OPM401: ["STA201"], RES501: ["STA201"], SCM501: ["OPM401"], FIN503: ["FIN402"], STM601: ["MGT101"], MKT603: ["MKT201"], HRM602: ["HRM401"], LDR701: ["ORG301"], BNK701: ["FIN301"], MKT704: ["MKT201"], PRJ801: ["PRJ701"], PMG801: ["MGT101"], CRM801: ["MKT201"], MIS501: ["ICT201"] };
  const title = new Map(BBA_SCHEME.map(([, c, t]) => [c, t]));
  return BBA_SCHEME.map(([sem, code, t, ch, type]) => {
    const k = BBA_CONTENT[code];
    const topics = (k?.topics || []).map((x) => ({ topic: x, subs: ["Concepts", "Applications and case exercises"] as [string, string] }));
    return {
      field: "MANAGEMENT" as Field, discipline: BBA_DISC(code), area: areaOf("MANAGEMENT", code), title: t, ch, theory: ch, lab: 0, semester: sem,
      semesterReason: `Semester ${sem} in the HEC BBA (Hons) scheme used by the institute${pre[code] ? `; after ${pre[code].map((p) => title.get(p)).join(", ")}` : ""}.`,
      source: REF, sourceNote: `Course from the HEC BBA (Hons) scheme (${type}); CLOs and lecture plan written by OBEHUB.`, instituteCodes: [{ code, of: "BBA scheme" }],
      clos: (k?.clos || []).map((c) => ({ statement: c.statement, bloom: c.bloom, source: REF })), plan: topics.length ? planFrom15(topics) : [],
      pre: (pre[code] || []).map((p) => ({ title: title.get(p)!, strength: (/II$/.test(t) || /^PRJ8/.test(code) ? "STRONG" : "MILD") as Strength, reason: `${REF}: builds on ${title.get(p)}.` })),
      books: (BBA_BOOKS[code] || []).map((b, i) => ({ title: b, kind: i ? "REFERENCE" as const : "TEXT" as const })),
    };
  });
}

function extraRaws(): Raw[] {
  return EXTRA_COURSES.map((c) => ({
    field: c.field, discipline: c.discipline, area: c.area, title: c.title, ch: c.ch, theory: c.lab ? c.ch - 1 : c.ch, lab: c.lab, semester: c.semester,
    semesterReason: `${REF}: semester ${c.semester}${c.pre.length ? `, after ${c.pre.join(" and ")}` : ""}.`, source: REF, sourceNote: "Standard course written by OBEHUB — check against your council's guidance.", instituteCodes: [],
    clos: c.clos.split(";;").map((x) => { const [s, b] = x.split("|").map((y) => y.trim()); return { statement: s, bloom: b, source: REF }; }),
    plan: planFrom15(c.topics.split(/;\s*/).filter(Boolean).map((t) => { const [topic, subs] = t.split(/:\s*/); const [a, b] = (subs || "").split(/\s*\/\s*/); return { topic: topic.trim(), subs: [a || "Concepts", b || a || "Practice"] as [string, string] }; })),
    pre: c.pre.map((p) => ({ title: p, strength: "STRONG" as Strength, reason: `${REF}: needed before ${c.title}.` })),
    books: c.books.map((b, i) => ({ title: b, kind: i ? "REFERENCE" as const : "TEXT" as const })),
  }));
}

/** The whole catalog, ready to store (ids are the codes until stored). */
export function buildCatalog(): CatalogEntry[] {
  const raws = [...computingRaws(), ...managementRaws(), ...extraRaws()].filter((r) => r.plan.length && r.clos.length);
  const byKey = new Map(raws.map((r) => [`${r.field}|${keyOf(r.title)}`, r]));
  // Semesters where a document gave none: after the prerequisites.
  for (let pass = 0; pass < 3; pass++) for (const r of raws) if (!r.semester) {
    const found = r.pre.map((p) => byKey.get(`${r.field}|${keyOf(p.title)}`)).filter((x): x is Raw => !!x);
    if (found.some((x) => !x.semester) && pass < 2) continue; // wait until every prerequisite has its semester
    const ps = found.map((x) => x.semester).filter((x): x is number => !!x);
    if (ps.length || !found.length) { const s = ps.length ? Math.min(8, Math.max(...ps) + 1) : r.discipline === "General Education" || r.discipline === "Mathematics" ? 2 : 5; r.semester = s; r.semesterReason = ps.length ? `${REF}: the semester after its prerequisites (${r.pre.map((p) => p.title).join(", ")}).` : `${REF}: ${s <= 2 ? "a foundation course for the first year" : "a track course for the third year"}.`; }
  }
  for (const r of raws) if (!r.semester) { r.semester = r.discipline === "General Education" || r.discipline === "Mathematics" ? 3 : 5; r.semesterReason = `${REF}: placed after its prerequisites (${r.pre.map((p) => p.title).join(", ") || "none"}).`; }
  // Codes: field prefix, level, area, serial.
  const entries: CatalogEntry[] = [];
  const serial = new Map<string, number>();
  const sorted = [...raws].sort((a, b) => a.field.localeCompare(b.field) || (a.semester ?? 9) - (b.semester ?? 9) || a.area - b.area || a.title.localeCompare(b.title));
  for (const r of sorted) {
    const level = levelOf(r.semester), k = `${r.field}|${level}|${r.area}`, s = (serial.get(k) || 0) + 1;
    serial.set(k, s);
    const code = makeCode(r.field, level, r.area, s), gaSet = FIELDS[r.field].gaSet;
    const clos: CatClo[] = r.clos.map((c, i) => ({ n: i + 1, statement: c.statement, bloom: c.bloom, gas: gaFor(gaSet, c.statement, c.bloom), source: c.source }));
    const map = mapLectures(r.plan.map((p) => `${p.topic} ${p.sub}`), clos.map((c) => c.statement));
    const lectures: CatLecture[] = r.plan.map((p, i) => ({ n: i + 1, topic: p.topic, sub: p.sub, clo: isGeneric(p.topic) ? null : map[i], importance: "IMPORTANT", chapter: null, pr: null }));
    entries.push({ id: code, field: r.field, discipline: r.discipline, code, title: r.title, level, area: r.area, serial: s, creditHours: r.ch, theoryCh: r.theory, labCh: r.lab, semester: r.semester, semesterReason: r.semesterReason, gaSet, source: r.source || REF, sourceNote: r.sourceNote || null, instituteCodes: r.instituteCodes, clos, lectures, prereqs: [], topicLinks: [], books: r.books, version: 1 });
  }
  const byTitle = new Map(entries.map((e) => [keyOf(e.title), e]));
  const inField = new Map(entries.map((e) => [`${e.field}|${keyOf(e.title)}`, e]));
  const rawOf = new Map(sorted.map((r, i) => [entries[i].code, r]));
  for (const e of entries) {
    e.prereqs = rawOf.get(e.code)!.pre.map((p) => { const t = inField.get(`${e.field}|${keyOf(p.title)}`) || byTitle.get(keyOf(p.title)); return { code: t?.code || null, title: t?.title || p.title, strength: p.strength, reason: p.reason } as CatPrereq; });
  }
  for (const e of entries) linkTopics(e, byTitle);
  for (const e of entries) setImportance(e, entries);
  for (const e of entries) setChapters(e);
  return entries;
}

/** Topic links: each lecture to the prerequisite course's closest topic (marked PR), and to an earlier lecture of the same course. */
export function linkTopics(e: CatalogEntry, byTitle: Map<string, CatalogEntry>) {
  const links: CatTopicLink[] = [];
  const byCode = new Map(Array.from(byTitle.values()).map((x) => [x.code, x]));
  const strength = (s: number): Strength => (s >= 0.8 ? "STRONG" : s >= 0.6 ? "MILD" : "WEAK");
  for (const l of e.lectures) {
    l.pr = null;
    if (isGeneric(l.topic)) continue;
    const t = tokens(`${l.topic} ${l.sub}`);
    let best: { code: string; n: number; s: number } | null = null;
    for (const p of e.prereqs) {
      const pe = p.code ? byCode.get(p.code) : null;
      for (const m of pe?.lectures || []) { if (isGeneric(m.topic)) continue; const s = topicSimilarity(t, tokens(`${m.topic} ${m.sub}`)); if (s >= 0.5 && (!best || s > best.s)) best = { code: pe!.code, n: m.n, s }; }
    }
    if (best) { links.push({ lecture: l.n, fromCode: best.code, fromLecture: best.n, strength: strength(best.s), within: false }); l.pr = `PR: ${best.code} L${best.n}`; }
    const prev = e.lectures.filter((m) => m.n < l.n && !isGeneric(m.topic) && m.topic !== l.topic).map((m) => ({ m, s: topicSimilarity(t, tokens(`${m.topic} ${m.sub}`)) })).filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s)[0];
    if (prev) links.push({ lecture: l.n, fromCode: e.code, fromLecture: prev.m.n, strength: strength(prev.s), within: true });
  }
  e.topicLinks = links;
  // A derived prerequisite's strength follows how many topics build on it.
  e.prereqs = e.prereqs.map((p) => { if (!p.code || p.strength === "STRONG") return p; const n = links.filter((x) => !x.within && x.fromCode === p.code).length; return { ...p, strength: n >= 4 ? "STRONG" : n >= 2 ? "MILD" : "WEAK" }; });
}
/** Core: later courses build on it, or it carries a CLO's main words; Optional: the last topics nothing builds on. */
export function setImportance(e: CatalogEntry, all: CatalogEntry[]) {
  const usedLater = new Set(all.flatMap((x) => x.topicLinks.filter((l) => l.fromCode === e.code && !l.within).map((l) => l.fromLecture)));
  const real = e.lectures.filter((l) => !isGeneric(l.topic));
  const tail = new Set(real.slice(-Math.max(1, Math.round(real.length * 0.12))).map((l) => l.n));
  for (const l of e.lectures) {
    let imp: Importance = "IMPORTANT";
    const clo = e.clos.find((c) => c.n === l.clo);
    if (usedLater.has(l.n) || (clo && topicSimilarity(`${l.topic} ${l.sub}`, clo.statement) >= 0.5)) imp = "CORE";
    else if (tail.has(l.n)) imp = "OPTIONAL";
    l.importance = imp;
  }
}
/** Indicative chapter of the text book for each lecture (in order through the book) — confirm with the book's contents. */
export function setChapters(e: CatalogEntry) {
  const text = e.books.find((b) => b.kind === "TEXT");
  const real = e.lectures.filter((l) => !isGeneric(l.topic));
  const chapters = 12;
  real.forEach((l, i) => { l.chapter = text ? `Ch ${1 + Math.floor((i * chapters) / Math.max(1, real.length))}` : null; });
}

const BBA_BOOKS: Record<string, string[]> = {
  MGT101: ["Management, 15th ed., Stephen Robbins and Mary Coulter"], ACC101: ["Financial Accounting, 11th ed., Weygandt, Kimmel and Kieso"], ACC102: ["Financial Accounting, 11th ed., Weygandt, Kimmel and Kieso"],
  ECO101: ["Principles of Microeconomics, N. Gregory Mankiw"], ECO102: ["Principles of Macroeconomics, N. Gregory Mankiw"], ENG101: ["Oxford Practice Grammar, John Eastwood"], ENG102: ["Business Communication Today, Bovee and Thill"],
  MTH101: ["Mathematics for Business, Economics, Life Sciences and Social Sciences, Barnett, Ziegler and Byleen"], STA201: ["Statistics for Business and Economics, Anderson, Sweeney and Williams"], MKT201: ["Principles of Marketing, Philip Kotler and Gary Armstrong"],
  FIN301: ["Principles of Managerial Finance, Lawrence Gitman and Chad Zutter"], ORG301: ["Organizational Behavior, Stephen Robbins and Timothy Judge"], CMA301: ["Cost Accounting: A Managerial Emphasis, Horngren, Datar and Rajan"],
  BLW301: ["Mercantile Law, M. C. Shukla"], ICT201: ["Discovering Computers, Vermaat et al."], HRM401: ["Human Resource Management, Gary Dessler"], OPM401: ["Operations Management, William Stevenson"],
  FIN402: ["Financial Management: Theory and Practice, Brigham and Ehrhardt"], MKT402: ["Consumer Behavior, Schiffman and Wisenblit"], PSY201: ["Psychology, Saundra Ciccarelli and J. Noland White"],
  RES501: ["Business Research Methods, Cooper and Schindler"], ENT501: ["Entrepreneurship, Hisrich, Peters and Shepherd"], SCM501: ["Supply Chain Management: Strategy, Planning and Operation, Chopra and Meindl"],
  MIS501: ["Management Information Systems, Laudon and Laudon"], FIN503: ["Investments, Bodie, Kane and Marcus"], STM601: ["Strategic Management: Concepts and Cases, Fred David"], IBS601: ["International Business, Charles Hill"],
  BET601: ["Business Ethics: Concepts and Cases, Manuel Velasquez"], MKT603: ["Digital Marketing, Dave Chaffey and Fiona Ellis-Chadwick"], HRM602: ["Compensation, Milkovich, Newman and Gerhart"],
  LDR701: ["Leadership in Organizations, Gary Yukl"], BNK701: ["An Introduction to Islamic Finance, Muhammad Taqi Usmani"], MKT704: ["Strategic Brand Management, Kevin Lane Keller"],
  PMG801: ["Project Management: The Managerial Process, Larson and Gray"], CRM801: ["Customer Relationship Management, Francis Buttle and Stan Maklan"], PRJ701: ["Business Research Methods, Cooper and Schindler"], PRJ801: ["Business Research Methods, Cooper and Schindler"],
};
