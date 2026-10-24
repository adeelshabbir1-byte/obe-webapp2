// Starting points for the Curriculum Builder: the course types (categories) of common council curricula with their
// targets and required courses. PRE-FILLED from general knowledge of the NCEAC 2023 computing curricula and the HEC
// Undergraduate Education Policy 2023 — every template is marked "check against the curriculum document" until a
// Curriculum Builder confirms it. Numbers and names are deliberately easy to change on the Types step.

export type Kind = "GE" | "IDS" | "IDS_LIST" | "CORE" | "SUPPORTING" | "LAB" | "ELECTIVE_SLOT" | "ELECTIVE_LIST" | "CAPSTONE" | "INTERNSHIP" | "NONCREDIT";
export const KINDS: { kind: Kind; label: string; counts: boolean; batchType: string; color: string; help: string }[] = [
  { kind: "GE", label: "General Education", counts: true, batchType: "General Education", color: "#1565C0", help: "English, Islamic Studies, Pakistan Studies, QR, ICT …" },
  { kind: "CORE", label: "Core (compulsory)", counts: true, batchType: "Core", color: "#2E7D32", help: "Compulsory courses of the discipline" },
  { kind: "SUPPORTING", label: "Mathematics & supporting", counts: true, batchType: "Core", color: "#00897B", help: "Compulsory maths / science courses" },
  { kind: "LAB", label: "Lab", counts: true, batchType: "Lab", color: "#558B2F", help: "Labs taught as separate courses" },
  { kind: "IDS", label: "Interdisciplinary", counts: true, batchType: "IDS", color: "#00838F", help: "Interdisciplinary courses or slots" },
  { kind: "ELECTIVE_SLOT", label: "Elective slots", counts: true, batchType: "Elective", color: "#6A1B9A", help: "Places in the scheme (Elective-I, II …) with credit hours" },
  { kind: "CAPSTONE", label: "Capstone / FYP", counts: true, batchType: "Capstone Project", color: "#AD1457", help: "Final year project" },
  { kind: "INTERNSHIP", label: "Internship", counts: true, batchType: "Field Experience", color: "#EF6C00", help: "Field experience" },
  { kind: "ELECTIVE_LIST", label: "Elective list (options)", counts: false, batchType: "Domain Elective", color: "#9575CD", help: "The courses students choose from — not counted" },
  { kind: "IDS_LIST", label: "IDS list (options)", counts: false, batchType: "Domain IDS", color: "#4DB6AC", help: "Interdisciplinary options — not counted" },
  { kind: "NONCREDIT", label: "Non-credit / certification", counts: false, batchType: "Certification", color: "#8D6E63", help: "Required, no credit hours" },
];
export const kindInfo = (k: string | null | undefined) => KINDS.find((x) => x.kind === k) || KINDS[1];

export type TypeTpl = { name: string; kind: Kind; minCourses?: number; minCredits?: number; maxCredits?: number; required?: string[]; note?: string };
export type Template = { key: string; program: string; council: string; version: string; total: [number, number]; types: TypeTpl[]; tracks: string[]; note: string; verified: boolean; source?: string };

/** A required course written as "Title 4 (3+1)" / "Title 3": its title, credit hours and theory + lab split. */
export function parseReq(line: string) {
  const m = line.trim().match(/^(.*?)\s+(\d{1,2})(?:\s*\((\d{1,2})\s*\+\s*(\d{1,2})\))?$/);
  if (!m) return { title: line.trim(), ch: null as number | null, theory: null as number | null, lab: null as number | null };
  return { title: m[1].trim(), ch: Number(m[2]), theory: m[3] ? Number(m[3]) : null, lab: m[4] ? Number(m[4]) : null };
}
export const splitText = (ch: number, lab: number | null | undefined) => (lab ? `${ch} (${ch - lab}+${lab})` : `${ch}`);

// ---- NCEAC "BS Curriculum for Computing Disciplines 2023" (HEC / NCEAC), the official document:
// https://nceac.org.pk/Documents/Curriculums/BS%20Curriculm%20Computing%20Disciplines-2023.pdf
// The document writes credit hours as "4 (3-3)": 3 theory credit hours and 3 lab CONTACT hours = 1 lab credit hour.
// Here that is "4 (3+1)" (theory + lab credit hours).
const NCEAC_SRC = "https://nceac.org.pk/Documents/Curriculums/BS%20Curriculm%20Computing%20Disciplines-2023.pdf";
const GE_2023: TypeTpl = { name: "General Education", kind: "GE", minCredits: 30, minCourses: 12, required: [
  "Application of Information and Communication Technologies 3 (2+1)", "Functional English 3", "Expository Writing 3",
  "Quantitative Reasoning I (Discrete Structures) 3", "Quantitative Reasoning II (Calculus and Analytic Geometry) 3", "Islamic Studies 2",
  "Ideology and Constitution of Pakistan 2", "Social Sciences (e.g. Introduction to Management) 2", "Natural Sciences (Applied Physics) 3 (2+1)",
  "Arts and Humanities (Professional Practices) 2", "Civics and Community Engagement 2", "Entrepreneurship 2"] };
const CORE_2023: TypeTpl = { name: "Computing Core", kind: "CORE", minCredits: 46, minCourses: 14, note: "Includes the capstone (FYP-I and FYP-II)", required: [
  "Programming Fundamentals 4 (3+1)", "Object Oriented Programming 4 (3+1)", "Database Systems 4 (3+1)", "Digital Logic Design 3 (2+1)", "Data Structures 4 (3+1)",
  "Information Security 3 (2+1)", "Artificial Intelligence 3 (2+1)", "Computer Networks 3 (2+1)", "Software Engineering 3", "Computer Organization and Assembly Language 3 (2+1)",
  "Operating Systems 3 (2+1)", "Analysis of Algorithms 3", "Final Year Project I 2 (0+2)", "Final Year Project II 4 (0+4)"] };
const MATHS_2023: TypeTpl = { name: "Mathematics & Supporting Courses", kind: "SUPPORTING", minCredits: 12, minCourses: 4, required: ["Multivariable Calculus 3", "Linear Algebra 3", "Probability and Statistics 3", "Technical and Business Writing 3"] };
const ESUP_2023: TypeTpl = { name: "Elective Supporting Courses", kind: "IDS", minCredits: 3, minCourses: 1, note: "One course, e.g. Introduction to Marketing or Financial Accounting" };
const slots = (n: number): TypeTpl => ({ name: "Domain Elective", kind: "ELECTIVE_SLOT", minCredits: n * 3, minCourses: n, note: `${n} elective slots of 3 credit hours` });
const list = (courses: string[]): TypeTpl => ({ name: "Domain Elective list", kind: "ELECTIVE_LIST", required: courses, note: "The courses offered for the elective slots (not counted)" });
const nceac = (code: string, program: string, domainCore: string[], electives: string[]): Template => ({
  key: `NCEAC-BS-${code}-2023`, program, council: "NCEAC", version: "2023", total: [130, 130], tracks: [], verified: true, source: NCEAC_SRC,
  note: "From NCEAC's official BS Curriculum for Computing Disciplines 2023 — 44 courses, 130 credit hours",
  types: [GE_2023, CORE_2023, { name: "Domain Core", kind: "CORE", minCredits: 18, minCourses: 6, required: domainCore }, slots(7), MATHS_2023, ESUP_2023, list(electives)],
});

export const TEMPLATES: Template[] = [
  nceac("CS", "BS Computer Science",
    ["Theory of Automata 3", "Advanced Database Management Systems 3 (2+1)", "HCI and Computer Graphics 3 (2+1)", "Computer Architecture 3 (2+1)", "Compiler Construction 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Web Technologies 3 (2+1)", "Mobile Application Development I 3 (2+1)", "Advanced Programming 3 (2+1)", "Numerical Analysis 3 (2+1)", "Web Engineering 3 (2+1)", "Cyber Security 3 (2+1)", "Software Testing and Quality Assurance 3 (2+1)", "Mobile Application Development II 3 (2+1)", "Cloud Computing 3 (2+1)", "Computer Graphics 3 (2+1)", "Object Oriented Analysis and Design 3 (2+1)"]),
  nceac("SE", "BS Software Engineering",
    ["Software Design and Architecture 3", "Software Construction and Development 3 (2+1)", "Software Project Management 3 (2+1)", "Software Quality Engineering 3 (2+1)", "Software Requirement Engineering 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Software Verification and Validation 3 (2+1)", "Object Oriented Analysis and Design 3 (2+1)", "Computer Architecture 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Web Technologies 3 (2+1)", "Advanced Database Management 3", "Web Engineering 3 (2+1)", "Data Science 3 (2+1)", "Software Re-Engineering 3 (2+1)", "Mobile Application Development I 3 (2+1)"]),
  nceac("AI", "BS Artificial Intelligence",
    ["Programming for Artificial Intelligence 3 (2+1)", "Machine Learning 3 (2+1)", "Artificial Neural Networks and Deep Learning 3 (2+1)", "Knowledge Representation and Reasoning 3 (2+1)", "Computer Vision 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Natural Language Processing 3 (2+1)", "Speech Processing 3 (2+1)", "Data Mining 3 (2+1)", "Advanced Statistics 3 (2+1)", "Reinforcement Learning 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Fuzzy Systems 3 (2+1)", "Swarm Intelligence 3 (2+1)", "Agent Based Modeling 3 (2+1)", "Knowledge Based Systems 3 (2+1)"]),
  nceac("DS", "BS Data Science",
    ["Introduction to Data Science 3 (2+1)", "Advanced Statistics 3 (2+1)", "Data Mining 3 (2+1)", "Data Visualization 3 (2+1)", "Data Warehousing and Business Intelligence 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Advanced Database Management Systems 3 (2+1)", "Big Data Analytics 3 (2+1)", "Machine Learning 3 (2+1)", "Artificial Neural Networks and Deep Learning 3 (2+1)", "Business Process Analysis 3 (2+1)", "Theory of Automata 3 (2+1)", "HCI and Computer Graphics 3 (2+1)", "Platforms and Architectures for Data Science 3 (2+1)", "Text Mining 3 (2+1)", "Topics in Data Science 3 (2+1)", "Speech Processing 3 (2+1)"]),
  nceac("CYS", "BS Cyber Security",
    ["Cyber Security 3 (2+1)", "Information Assurance 3 (2+1)", "Network Security 3 (2+1)", "Secure Software Design and Development 3 (2+1)", "Digital Forensics 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Vulnerability Assessment and Reverse Engineering 3 (2+1)", "Basic Electronics 3 (2+1)", "Hardware Security 3 (2+1)", "Malware Analysis 3 (2+1)", "Wireless and Mobile Security 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Penetration Testing 3 (2+1)", "Computer Architecture 3 (2+1)", "Advanced Digital Logic Design 3 (2+1)", "Embedded Systems 3 (2+1)", "Cyber Law and Cyber Crime 3 (2+1)", "Control System Security 3 (2+1)"]),
  { ...nceac("IT", "BS Information Technology", [], []), verified: false, note: "Common parts from the NCEAC 2023 document; the IT Domain Core and electives are NOT filled — enter them from section 4.9 of the document" },
  { key: "HEC-UG-2023", program: "Any undergraduate program", council: "HEC", version: "UG Policy 2023", total: [120, 144], tracks: [], verified: false, note: "HEC Undergraduate Education Policy baseline — adapt names and numbers to the discipline",
    types: [GE_2023, { name: "Major Core", kind: "CORE", minCredits: 72 }, { name: "Interdisciplinary", kind: "IDS", minCredits: 12 }, slots(4), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, { name: "Internship", kind: "INTERNSHIP", minCredits: 3, minCourses: 1 }, list([])] },
  { key: "NBEAC-BBA", program: "BBA (Hons)", council: "NBEAC", version: "draft", total: [130, 136], tracks: ["Finance", "Marketing", "Human Resource Management", "Supply Chain", "Business Analytics"], verified: false, note: "NOT from an official document — an outline to adapt; enter NBEAC's requirements",
    types: [GE_2023, { name: "Business Core", kind: "CORE", minCredits: 60 }, { name: "Interdisciplinary", kind: "IDS", minCredits: 12 }, slots(6), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, { name: "Internship", kind: "INTERNSHIP", minCredits: 3 }, list([])] },
];

// Words that put a course into a type when its title gives no exact match.
const HINTS: [RegExp, Kind][] = [
  [/english|writing|islam|ethics|pakistan|constitution|quantitative reasoning|civics|ict\b|information and communication|entrepreneur|arts|humanit|social science|natural science|psycholog|sociolog|quran/i, "GE"],
  [/calculus|linear algebra|probability|statistic|discrete|differential equation|numerical|physics|mathemat/i, "SUPPORTING"],
  [/final year project|fyp|capstone/i, "CAPSTONE"], [/internship|field experience/i, "INTERNSHIP"], [/\blab\b|laboratory/i, "LAB"],
  [/elective[- ]?(i|ii|iii|iv|v|vi|vii|viii|\d+)\b/i, "ELECTIVE_SLOT"],
];
export const normTitle = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\b(i{1,3}|iv|v)\b$/i, (m) => m).replace(/[^a-z0-9]+/g, " ").trim();
/** Which type a course goes to: an exact required-course match first, then its old category, then title hints. */
export function autoPlace(course: { title: string; category: string }, types: { name: string; kind: string; required: string[] }[]) {
  const t = normTitle(course.title);
  const rt = (r: string) => normTitle(parseReq(r).title);
  const exact = types.find((ty) => ty.required.some((r) => rt(r) === t || normTitle(parseReq(r).title.replace(/\s*\(.*?\)\s*/g, " ")) === t || (/\((.*?)\)/.exec(parseReq(r).title)?.[1] && normTitle(/\((.*?)\)/.exec(parseReq(r).title)![1].replace(/^e\.?g\.?\s*/i, "")) === t)));
  if (exact) return exact.name;
  const old = course.category.toLowerCase();
  const byKind = (k: Kind) => types.find((ty) => ty.kind === k)?.name;
  if (old === "domain elective") return byKind("ELECTIVE_LIST") || byKind("ELECTIVE_SLOT");
  if (old === "domain ids") return byKind("IDS_LIST") || byKind("IDS");
  if (old === "elective") return byKind("ELECTIVE_SLOT");
  if (old === "general education") return byKind("GE");
  if (old === "ids") return byKind("IDS");
  if (old === "capstone project") return byKind("CAPSTONE");
  if (old === "field experience") return byKind("INTERNSHIP");
  for (const [re, k] of HINTS) if (re.test(course.title)) { const n = byKind(k); if (n) return n; }
  const near = types.find((ty) => ty.required.some((r) => { const a = rt(r); return a.length > 6 && (t.includes(a) || a.includes(t)); }));
  if (near) return near.name;
  return types.find((ty) => ty.kind === "CORE")?.name || null;
}

/** Is a required course (written "Title 3 (2+1)", maybe "QR I (Discrete Structures)") among these titles? */
export function reqPresent(req: string, titles: string[]) {
  const t = parseReq(req).title;
  const keys = [normTitle(t), normTitle(t.replace(/\s*\(.*?\)\s*/g, " ")), ...(/\((.*?)\)/.exec(t) ? [normTitle(/\((.*?)\)/.exec(t)![1].replace(/^e\.?\s*g\.?\s*/i, ""))] : [])].filter(Boolean);
  return titles.some((x) => { const a = normTitle(x); return keys.some((q) => a === q || (q.length > 6 && a.length > 6 && (a.includes(q) || q.includes(a)))); });
}

