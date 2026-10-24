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
export type Template = { key: string; program: string; council: string; version: string; total: [number, number]; types: TypeTpl[]; tracks: string[]; note: string };

const GE_HEC: TypeTpl = { name: "General Education", kind: "GE", minCredits: 30, minCourses: 11, required: ["Functional English", "Expository Writing", "Quantitative Reasoning I", "Quantitative Reasoning II", "Islamic Studies", "Ideology and Constitution of Pakistan", "Applications of Information and Communication Technologies", "Civics and Community Engagement", "Entrepreneurship"], note: "HEC UG Policy 2023: 30+ CH incl. Arts & Humanities, Natural Sciences and Social Sciences" };
const COMPUTING_CORE: TypeTpl = { name: "Computing Core", kind: "CORE", minCredits: 46, minCourses: 14, required: ["Programming Fundamentals", "Object Oriented Programming", "Data Structures", "Database Systems", "Digital Logic Design", "Computer Organization and Assembly Language", "Operating Systems", "Computer Networks", "Software Engineering", "Information Security", "Artificial Intelligence", "Analysis of Algorithms", "Final Year Project I", "Final Year Project II"] };
const MATHS: TypeTpl = { name: "Mathematics & Supporting", kind: "SUPPORTING", minCredits: 12, minCourses: 4, required: ["Calculus and Analytical Geometry", "Linear Algebra", "Probability and Statistics", "Discrete Structures"] };
const IDS: TypeTpl = { name: "Interdisciplinary / Elective Supporting", kind: "IDS", minCredits: 12, note: "HEC UG Policy 2023: interdisciplinary courses" };
const SLOTS = (n: number): TypeTpl => ({ name: "Domain Elective slots", kind: "ELECTIVE_SLOT", minCredits: n * 3, minCourses: n, note: `${n} elective slots of 3 CH` });
const LIST: TypeTpl = { name: "Elective list", kind: "ELECTIVE_LIST", note: "Courses students choose for the elective slots, sorted into tracks" };
const INTERN: TypeTpl = { name: "Internship", kind: "INTERNSHIP", minCredits: 3, minCourses: 1, required: ["Internship"] };
const TRACKS = ["Artificial Intelligence", "Computer Science", "Software Engineering", "Cyber Security", "Data Science", "Networks & Cloud"];
const computing = (key: string, program: string, domainCore: string[]): Template => ({
  key, program, council: "NCEAC", version: "2023", total: [130, 136], tracks: TRACKS,
  note: "Pre-filled from the NCEAC 2023 model curriculum as generally known — check every number and course against the curriculum document.",
  types: [GE_HEC, COMPUTING_CORE, { name: "Domain Core", kind: "CORE", minCredits: 18, minCourses: 6, required: domainCore }, MATHS, SLOTS(7), IDS, INTERN, LIST],
});

export const TEMPLATES: Template[] = [
  computing("NCEAC-BS-CS-2023", "BS Computer Science", ["Theory of Automata", "Compiler Construction", "Advanced Database Management Systems", "Computer Architecture", "Parallel and Distributed Computing", "Human Computer Interaction"]),
  computing("NCEAC-BS-SE-2023", "BS Software Engineering", ["Software Requirements Engineering", "Software Design and Architecture", "Software Construction and Development", "Software Quality Engineering", "Software Project Management", "Web Engineering"]),
  computing("NCEAC-BS-AI-2023", "BS Artificial Intelligence", ["Programming for Artificial Intelligence", "Machine Learning", "Artificial Neural Networks and Deep Learning", "Knowledge Representation and Reasoning", "Computer Vision", "Natural Language Processing"]),
  computing("NCEAC-BS-DS-2023", "BS Data Science", ["Introduction to Data Science", "Data Mining", "Data Warehousing", "Data Visualization", "Machine Learning", "Big Data Analytics"]),
  computing("NCEAC-BS-CYS-2023", "BS Cyber Security", ["Information Assurance", "Network Security", "Digital Forensics", "Secure Software Design", "Vulnerability Assessment and Reverse Engineering", "Cyber Law and Ethics"]),
  computing("NCEAC-BS-IT-2023", "BS Information Technology", ["Web Technologies", "System and Network Administration", "IT Infrastructure", "Cloud Computing", "Mobile Application Development", "IT Project Management"]),
  { key: "HEC-UG-2023", program: "Any undergraduate program", council: "HEC", version: "UG Policy 2023", total: [120, 144], tracks: [], note: "The HEC Undergraduate Education Policy 2023 baseline: adapt the names and numbers to the discipline.",
    types: [GE_HEC, IDS, { name: "Major Core", kind: "CORE", minCredits: 72 }, SLOTS(4), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, INTERN, LIST] },
  { key: "NBEAC-BBA-2023", program: "BBA (Hons)", council: "NBEAC", version: "2023", total: [130, 136], tracks: ["Finance", "Marketing", "Human Resource Management", "Supply Chain", "Business Analytics"], note: "Pre-filled outline for a 4-year BBA under the HEC UG Policy — check against NBEAC's requirements.",
    types: [GE_HEC, { name: "Business Core", kind: "CORE", minCredits: 60, required: ["Principles of Management", "Financial Accounting", "Principles of Marketing", "Microeconomics", "Macroeconomics", "Business Statistics", "Organizational Behaviour", "Financial Management", "Human Resource Management", "Business Research Methods", "Strategic Management"] }, IDS, SLOTS(6), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, INTERN, LIST] },
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
  const exact = types.find((ty) => ty.required.some((r) => normTitle(r) === t));
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
  const near = types.find((ty) => ty.required.some((r) => { const a = normTitle(r); return a.length > 6 && (t.includes(a) || a.includes(t)); }));
  if (near) return near.name;
  return types.find((ty) => ty.kind === "CORE")?.name || null;
}
