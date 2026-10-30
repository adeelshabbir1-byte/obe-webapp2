import { tokens, topicSimilarity } from "./catalogCore";

/** Course titles alike in meaning: word forms and synonyms; every word counts (unlike lecture topics). */
export function titleSimilarity(a: string, b: string) {
  const A = tokens(a.replace(/(lab|laboratory|practical)/gi, "")), B = tokens(b.replace(/(lab|laboratory|practical)/gi, ""));
  if (!A.size || !B.size) return 0;
  const shared = Array.from(A).filter((w) => B.has(w)).length;
  if (shared < Math.min(2, A.size, B.size)) return 0;
  return Math.round((0.7 * (shared / Math.min(A.size, B.size)) + 0.3 * (shared / (A.size + B.size - shared))) * 100) / 100;
}

// Course homes and codes with no database. A course lives at the highest level where it is shared (like inheritance):
//   General education → the department that teaches it (EN, IS …) if the institute has one, else GE.
//   A service subject taught by another department (Maths, Physics, Management …) → that department's prefix.
//   Two or more programs of one department → the department's prefix (CS).
//   One program → the program's prefix (AI, SE …); a track is shown in the catalog, not in the code.
// Codes are PREFIX-YCN: Y = year from the planned semester, C = the department's chain (subject area), N = 1–9 in
// planned-semester order. A lab is the same code + L. The category (GE, Core, Elective …) stays separate from the code.

export type Level = "GE" | "SERVICE" | "DEPARTMENT" | "PROGRAM";
export const LEVEL_LABEL: Record<Level, string> = { GE: "University common (GE)", SERVICE: "Service / teaching department", DEPARTMENT: "Department common", PROGRAM: "One program" };
export type Dept = { id: string; name: string; prefix: string | null };
export type Program = { name: string; departmentId: string | null; prefix: string | null };
export type Use = { courseId: string; program: string; departmentId: string | null; semester: number | null; category: string };
export type Subject = { key: string; title: string; isLab: boolean; uses: Use[]; homeDeptHint?: string | null };
export type Placement = { level: Level; departmentId: string | null; program: string | null; prefix: string | null; reason: string; unclear?: boolean };

const norm = (t: string) => t.toLowerCase().replace(/&/g, " and ").replace(/\((?:ids|ge|lab)[^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export const isLabTitle = (t: string) => /\b(lab|laboratory|practical)\b/i.test(t);
/** One key per course across programs: its title without "Lab", plus whether it is the lab. */
export const subjectKey = (title: string) => `${norm(title).replace(/\b(lab|laboratory|practical)\b/g, "").replace(/\s+/g, " ").trim()}${isLabTitle(title) ? "|lab" : ""}`;
export const theoryKey = (key: string) => key.replace(/\|lab$/, "");

// Which department teaches a subject, by its words (the department's name must match).
const SUBJECT_DEPT: [RegExp, RegExp][] = [
  [/\b(english|composition|expository|writing|communication skills|functional english)\b/, /english|language/],
  [/\b(islamic|quran|seerat|ethics for non muslim|religious)\b/, /islamic/],
  [/\b(pakistan studies|ideology|constitution of pakistan)\b/, /pakistan studies|social science|humanities/],
  [/\b(calculus|algebra|differential equations|statistics|probability|discrete mathematics|numerical|mathematics|quantitative reasoning)\b/, /math/],
  [/\b(physics|mechanics|electromagnet)\b/, /physics/],
  [/\b(management|accounting|marketing|finance|economics|entrepreneurship|business)\b/, /management|business|commerce|economics/],
  [/\b(psychology)\b/, /psychology/],
];
const GE_TITLE = /\b(english|composition|expository|islamic|quran|pakistan studies|ideology|civics|arts and humanities|social science|natural science|quantitative reasoning|functional english)\b/;
export const isGE = (s: Subject) => s.uses.some((u) => /general education/i.test(u.category)) || GE_TITLE.test(norm(s.title));
export function teachingDept(s: Subject, depts: Dept[]) {
  if (s.homeDeptHint && depts.some((d) => d.id === s.homeDeptHint)) return depts.find((d) => d.id === s.homeDeptHint)!;
  const t = norm(s.title);
  for (const [subj, dept] of SUBJECT_DEPT) if (subj.test(t)) { const d = depts.find((x) => dept.test(x.name.toLowerCase())); if (d) return d; }
  return null;
}

export function proposeHome(s: Subject, depts: Dept[], programs: Program[]): Placement {
  const progs = Array.from(new Set(s.uses.map((u) => u.program)));
  const deptOf = (p: string) => programs.find((x) => x.name === p)?.departmentId ?? s.uses.find((u) => u.program === p)?.departmentId ?? null;
  const usingDepts = Array.from(new Set(progs.map(deptOf).filter((x): x is string => !!x)));
  const teach = teachingDept(s, depts);
  if (isGE(s)) {
    if (teach?.prefix) return { level: "SERVICE", departmentId: teach.id, program: null, prefix: teach.prefix, reason: `General education taught by ${teach.name}` };
    return { level: "GE", departmentId: null, program: null, prefix: "GE", reason: "General education; no department of the institute teaches it" };
  }
  if (teach && !(usingDepts.length === 1 && usingDepts[0] === teach.id && !s.homeDeptHint)) {
    if (!usingDepts.includes(teach.id) || usingDepts.length > 1 || s.homeDeptHint) return { level: "SERVICE", departmentId: teach.id, program: null, prefix: teach.prefix, reason: `Service subject taught by ${teach.name}` };
  }
  if (usingDepts.length === 1) {
    const d = depts.find((x) => x.id === usingDepts[0]);
    if (progs.length >= 2) return { level: "DEPARTMENT", departmentId: usingDepts[0], program: null, prefix: d?.prefix || null, reason: `Shared by ${progs.length} programs of ${d?.name || "the department"}` };
    const p = programs.find((x) => x.name === progs[0]);
    return { level: "PROGRAM", departmentId: usingDepts[0], program: progs[0], prefix: p?.prefix || d?.prefix || null, reason: `Only in ${progs[0]}` };
  }
  if (!usingDepts.length && progs.length === 1) { const p = programs.find((x) => x.name === progs[0]); return { level: "PROGRAM", departmentId: null, program: progs[0], prefix: p?.prefix || null, reason: `Only in ${progs[0]}` }; }
  // Used by programs of several departments and no department teaches it: the department that uses it most.
  const count = new Map<string, number>();
  for (const u of s.uses) if (u.departmentId) count.set(u.departmentId, (count.get(u.departmentId) || 0) + 1);
  const top = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const d = depts.find((x) => x.id === top);
  return { level: "DEPARTMENT", departmentId: top, program: null, prefix: d?.prefix || null, reason: `Used by ${usingDepts.length} departments — check its home`, unclear: true };
}

// ---- chains
export type Chain = { chain: number; name: string; words: RegExp };
const C = (rows: [string, string][]): Chain[] => rows.map(([name, words], i) => ({ chain: i, name, words: new RegExp(`\\b(${words})`, "i") }));
export const DEFAULT_CHAINS: { match: RegExp; chains: Chain[] }[] = [
  { match: /comput|software|information tech|artificial|data science|cyber/i, chains: C([
    ["Programming", "programming|object oriented|oop|coding|python|java"], ["Networks", "network|communication|cloud|internet|distributed"], ["Databases and data", "database|data |data$|big data|warehous|mining|visuali"],
    ["Systems", "operating system|organization|architecture|logic design|assembly|parallel|embedded|microprocess"], ["Theory and algorithms", "algorithm|automata|theory|discrete|compiler|data structure"],
    ["Software engineering", "software|requirement|design and architecture|project management|quality|testing|construction"], ["AI and ML", "artificial|machine learning|neural|deep learning|vision|natural language|knowledge|intelligen"],
    ["Security", "security|cyber|forensic|cryptograph|vulnerab|assurance"], ["Web, HCI and graphics", "web|mobile|human computer|hci|graphics|game|interaction"], ["Projects, FYP, internship and seminars", "project|fyp|capstone|internship|seminar|thesis"],
  ]) },
  { match: /math/i, chains: C([["Calculus and analysis", "calculus|analysis|differential|real"], ["Algebra", "algebra|matri"], ["Statistics and probability", "statistic|probabilit"], ["Discrete and applied", "discrete|numerical|operations research|quantitative"], ["Geometry", "geometr|topolog"], ["Applied mathematics", "mechanics|optimization"], ["Mathematics electives", "x^"], ["Mathematics electives II", "x^"], ["Seminars", "seminar"], ["Projects and research", "project|research|thesis"]]) },
  { match: /management|business|commerce/i, chains: C([["Management and organisation", "management|organi|leadership|strateg"], ["Accounting", "accounting|cost|audit"], ["Finance", "finance|investment|bank"], ["Marketing", "marketing|consumer|brand|sales"], ["Human resources", "human resource|hrm|compensation"], ["Operations and supply chain", "operation|supply chain|logistic"], ["Economics", "economic"], ["Information systems and analytics", "information|analytics|e business"], ["Law and ethics", "law|ethic|csr"], ["Projects, internship and seminars", "project|internship|seminar|thesis"]]) },
  { match: /english|language|humanities|islamic|pakistan|social/i, chains: C([["Language and writing", "english|writing|composition|grammar|language"], ["Communication", "communication|presentation|speaking"], ["Literature", "literature|poetry|novel|drama"], ["Linguistics", "linguist|phonetic"], ["Islamic studies", "islamic|quran|seerat"], ["Pakistan and society", "pakistan|ideology|constitution|civics|social"], ["Arts and humanities", "arts|humanities|philosophy|history"], ["Ethics", "ethic"], ["Electives", "x^"], ["Projects and seminars", "project|seminar|thesis"]]) },
];
export const GENERIC_CHAINS = C([["Foundations", "introduction|fundamental|basic|principles"], ["Core I", "x^"], ["Core II", "x^"], ["Core III", "x^"], ["Applied", "applied|practice"], ["Advanced", "advanced"], ["Electives", "elective"], ["Labs and practicals", "lab|practical"], ["Research methods", "research"], ["Projects, internship and seminars", "project|fyp|internship|seminar|thesis"]]);
export const chainsForDept = (deptName: string) => DEFAULT_CHAINS.find((d) => d.match.test(deptName))?.chains || GENERIC_CHAINS;
/** The chain a course belongs to, by its words (the department can change it). */
export function suggestChain(title: string, chains: Chain[]) {
  const t = ` ${title.toLowerCase()} `;
  const hit = chains.find((c) => c.words.test(t));
  return hit ? hit.chain : 0;
}
export const yearOf = (semester: number | null | undefined) => (semester ? Math.min(4, Math.max(1, Math.ceil(semester / 2))) : null);

// ---- codes
export type CodeRow = { key: string; title: string; isLab: boolean; prefix: string | null; semester: number | null; chain: number | null; approvedCode?: string | null; renumber?: boolean };
export type Coded = { key: string; code: string | null; year: number | null; chain: number | null; n: number | null; flags: string[] };
export const formatCode = (prefix: string, y: number, c: number, n: number) => `${prefix}-${y}${c}${n}`;
export const parseCode = (code: string) => { const m = /^([A-Z]{2,4})-(\d)(\d)(\d{1,2})(L?)$/.exec(code.toUpperCase()); return m ? { prefix: m[1], year: +m[2], chain: +m[3], n: +m[4], lab: !!m[5] } : null; };
/**
 * Codes for every course: an approved code stays (a moved semester keeps it; only the BOS renumbers); new ones take the
 * next free number in their prefix, year and chain, in planned-semester order; a lab takes its theory's code + L.
 */
export function assignCodes(rows: CodeRow[]): Coded[] {
  const taken = new Set<string>();
  const out = new Map<string, Coded>();
  for (const r of rows) if (r.approvedCode && !r.renumber) { const p = parseCode(r.approvedCode); taken.add(r.approvedCode.replace(/L$/, "")); out.set(r.key, { key: r.key, code: r.approvedCode, year: p?.year ?? null, chain: p?.chain ?? null, n: p?.n ?? null, flags: [] }); }
  const theory = rows.filter((r) => !r.isLab && !out.has(r.key)).sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99) || a.title.localeCompare(b.title));
  for (const r of theory) {
    const year = yearOf(r.semester), flags: string[] = [];
    if (!r.prefix) { out.set(r.key, { key: r.key, code: null, year, chain: r.chain, n: null, flags: ["No prefix for its home yet — the Dean / Chairman sets it"] }); continue; }
    if (!year) { out.set(r.key, { key: r.key, code: null, year: null, chain: r.chain, n: null, flags: ["No planned semester"] }); continue; }
    const chain = r.chain ?? 0;
    let n = 1;
    while (n <= 9 && taken.has(formatCode(r.prefix, year, chain, n))) n++;
    if (n > 9) { out.set(r.key, { key: r.key, code: null, year, chain, n: null, flags: [`Chain ${chain} of year ${year} is full (9 courses) — move it to a neighbouring chain (${chain === 9 ? 8 : chain + 1}) or split the chain`] }); continue; }
    const code = formatCode(r.prefix, year, chain, n);
    taken.add(code);
    out.set(r.key, { key: r.key, code, year, chain, n, flags });
  }
  for (const r of rows.filter((x) => x.isLab && !out.has(x.key))) {
    const th = out.get(theoryKey(r.key));
    if (th?.code) { out.set(r.key, { ...th, key: r.key, code: `${th.code.replace(/L$/, "")}L`, flags: [] }); continue; }
    const own = assignCodes(([{ ...r, isLab: false, key: theoryKey(r.key) + "#lab", approvedCode: null }] as CodeRow[]).concat(rows.filter((x) => !x.isLab && (x.approvedCode || out.has(x.key))).map((x) => ({ ...x, approvedCode: x.approvedCode || out.get(x.key)?.code || null }))))[0];
    out.set(r.key, { ...own, key: r.key, code: own.code ? `${own.code}L` : null, flags: [...own.flags, "Lab with no theory course of the same name"] });
  }
  return rows.map((r) => out.get(r.key)!);
}
/** Duplicate codes (two courses with one code). */
export function duplicateCodes(coded: { key: string; code: string | null }[]) {
  const by = new Map<string, string[]>();
  for (const c of coded) if (c.code) by.set(c.code, [...(by.get(c.code) || []), c.key]);
  return Array.from(by.entries()).filter(([, ks]) => ks.length > 1).map(([code, keys]) => ({ code, keys }));
}

// ---- the same course across degrees
export type Match = { a: string; b: string; confidence: number; reason: string };
/** Titles alike in meaning (word forms, synonyms), plus overlapping CLOs and topics. */
export function findMatches(subjects: { key: string; title: string; clos?: string[]; topics?: string[] }[], known: { a: string; b: string; reason: string }[] = []) {
  const out: Match[] = known.map((k) => ({ ...k, confidence: 100 }));
  const seen = new Set(out.map((m) => [m.a, m.b].sort().join("~")));
  for (let i = 0; i < subjects.length; i++) for (let j = i + 1; j < subjects.length; j++) {
    const a = subjects[i], b = subjects[j];
    if (a.key === b.key || a.key.endsWith("|lab") !== b.key.endsWith("|lab")) continue;
    const id = [a.key, b.key].sort().join("~");
    if (seen.has(id)) continue;
    const title = titleSimilarity(a.title, b.title);
    const overlap = (x?: string[], y?: string[]) => { if (!x?.length || !y?.length) return 0; let hit = 0; for (const s of x) if (y.some((t) => topicSimilarity(s, t) >= 0.75)) hit++; return hit / Math.min(x.length, y.length); };
    const clo = overlap(a.clos, b.clos), top = overlap(a.topics, b.topics);
    const score = Math.max(title >= 0.75 ? title : 0, title >= 0.5 ? 0.5 * title + 0.25 * clo + 0.25 * top : 0, top >= 0.6 && clo >= 0.4 ? 0.4 * top + 0.4 * clo : 0);
    if (score >= 0.6) { seen.add(id); out.push({ a: a.key, b: b.key, confidence: Math.round(score * 100), reason: [title >= 0.5 ? `titles alike (${Math.round(title * 100)}%)` : "", clo ? `${Math.round(clo * 100)}% of CLOs overlap` : "", top ? `${Math.round(top * 100)}% of topics overlap` : ""].filter(Boolean).join(", ") }); }
  }
  return out.sort((x, y) => y.confidence - x.confidence);
}

// ---- the content-sync base follows the course's home
export type Copy = { courseId: string; program: string | null; departmentId: string | null; startKey: number; hasBatch: boolean };
/**
 * The base of a sync group: the latest copy inside the course's home — its program; the department's lead program
 * (department-common); the teaching department (service / GE), whose own copy may have no batch. Outside the home: null
 * (the caller keeps the current rule, e.g. "planned for BSCS" before the home department teaches it).
 */
export function homeBase(copies: Copy[], home: Placement & { leadProgram?: string | null }) {
  let inHome: Copy[] = [];
  if (home.level === "PROGRAM") inHome = copies.filter((c) => c.program === home.program);
  else if (home.level === "DEPARTMENT") { const lead = copies.filter((c) => c.program && c.program === home.leadProgram); inHome = lead.length ? lead : copies.filter((c) => c.departmentId === home.departmentId); }
  else inHome = copies.filter((c) => c.departmentId === home.departmentId);
  if (!inHome.length) return null;
  return inHome.sort((a, b) => b.startKey - a.startKey || Number(a.hasBatch) - Number(b.hasBatch))[0].courseId;
}
