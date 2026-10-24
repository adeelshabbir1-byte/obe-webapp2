// Course types of a scheme of studies. Elective and IDS are SLOTS: each slot is a place in the scheme with its credit
// hours (e.g. "Elective-III, 3 CH, semester 7") and counts toward the degree. "Domain Elective" and "Domain IDS" are the
// LISTS of courses a student may take in those slots: a list is only a list — its courses never add credit hours.

export type CourseType = { key: string; short: string; label: string; counts: boolean; listFor?: string; color: string; note: string };
export const COURSE_TYPES: CourseType[] = [
  { key: "General Education", short: "GE", label: "General Education", counts: true, color: "#1565C0", note: "HEC UG policy: at least 30 CH (English, Islamic Studies, Pakistan Studies, QR, ICT, …)" },
  { key: "IDS", short: "IDS", label: "Interdisciplinary — slots", counts: true, color: "#00838F", note: "Slots for interdisciplinary courses; at least 12 CH" },
  { key: "Domain IDS", short: "IDS list", label: "Interdisciplinary — list of options", counts: false, listFor: "IDS", color: "#7FB8BF", note: "Courses a student may take in an IDS slot; not counted" },
  { key: "Core", short: "Core", label: "Core / Major", counts: true, color: "#2E7D32", note: "Compulsory courses of the discipline" },
  { key: "Lab", short: "Lab", label: "Lab", counts: true, color: "#558B2F", note: "Lab courses taught as separate courses" },
  { key: "Elective", short: "Elective", label: "Elective — slots", counts: true, color: "#6A1B9A", note: "Elective places in the scheme (Elective-I, II, …), each with its credit hours" },
  { key: "Domain Elective", short: "Elective list", label: "Elective — list of options", counts: false, listFor: "Elective", color: "#B39DDB", note: "Courses a student may take in an elective slot (grouped by track); not counted" },
  { key: "Capstone Project", short: "FYP", label: "Capstone / Final Year Project", counts: true, color: "#AD1457", note: "Usually 6 CH over two semesters" },
  { key: "Field Experience", short: "Internship", label: "Field experience / internship", counts: true, color: "#EF6C00", note: "Internship (3 CH in the HEC UG policy)" },
  { key: "Certification", short: "Cert.", label: "Certification / non-credit", counts: false, color: "#8D6E63", note: "Required but carries no credit hours" },
];
const ALIAS: Record<string, string> = { major: "Core", "major core": "Core", "general education / other": "General Education", ge: "General Education", "domain elective": "Domain Elective", "domain ids": "Domain IDS", elective: "Elective", ids: "IDS", fyp: "Capstone Project", internship: "Field Experience" };
/** The standard type of a stored category ("Major" is Core, unknown ones are left as they are). */
export const typeKey = (c: string | null | undefined) => { const k = (c || "").trim(); return COURSE_TYPES.find((t) => t.key.toLowerCase() === k.toLowerCase())?.key || ALIAS[k.toLowerCase()] || k || "Core"; };
export const typeOf = (c: string | null | undefined) => COURSE_TYPES.find((t) => t.key === typeKey(c)) || { key: c || "Other", short: c || "Other", label: c || "Other", counts: true, color: "#6B7177", note: "" };
/** Does this course add credit hours to the degree? Lists of options and certifications do not. */
export const countsTowardDegree = (category: string | null | undefined) => typeOf(category).counts;
/** Total credit hours of a scheme, counting slots only. */
export const countedCredits = (cs: { creditHours: number; category?: string | null; courseType?: string | null }[]) => cs.reduce((t, c) => t + (countsTowardDegree(c.category ?? c.courseType) ? c.creditHours || 0 : 0), 0);
