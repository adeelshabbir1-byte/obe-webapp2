// The NCEAC portal's (AAS) dropdown lists, spelt exactly as the portal shows them, and the rules that turn OBEHUB's own
// wording into the portal's (e.g. "Assistant Professor" → "AssistantProfessor", "Permanent" → "FullTime").
// Pure code (no database) so forms, checks and exports all use the same lists. An institute can correct a list on the
// NCEAC Portal Data page; those corrections are passed in as `overrides`.

export type ListSource = "screenshot" | "template" | "report" | "check";
export type PortalList = { key: string; label: string; values: string[]; labels?: Record<string, string>; source: ListSource; note?: string };

export const GA_NAMES = ["Academic Education", "Knowledge for Solving Computing Problems", "Problem Analysis", "Design / Development of Solutions", "Modern Tool Usage", "Individual and Teamwork", "Communication", "Computing Professionalism and Society", "Ethics", "Life-long Learning"];

export const PORTAL_LISTS: PortalList[] = [
  { key: "contractType", label: "Contract Type", values: ["FullTime", "Visiting", "Shared"], source: "screenshot" },
  { key: "academicRank", label: "Academic Rank", values: ["Professor", "AssociateProfessor", "AssistantProfessor", "Lecturer", "TeachingAssistant", "LabAssistant", "LabInstructor", "PhDScholars"], source: "screenshot" },
  { key: "honorific", label: "Honorific", values: ["Mr", "Ms", "Mrs", "Dr", "Prof", "Engr"], source: "check", note: "Only “Mr” shows in the screenshot of the faculty form; confirm the rest on the portal." },
  { key: "facultyGender", label: "Gender (faculty)", values: ["Male", "Female"], source: "check", note: "The faculty template has no example row; confirm the spelling on the portal." },
  { key: "studentGender", label: "Gender (students file)", values: ["M", "F"], source: "template", note: "The students template's example row writes M." },
  { key: "degreeType", label: "Degree Type", values: ["PhD", "MS/MPhil", "BS", "Masters", "Bachelors"], source: "check", note: "Not visible in the screenshots; confirm on the portal (18-year degrees: MS/MPhil; 16-year: BS or Masters; 14-year: Bachelors)." },
  { key: "province", label: "Province", values: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad", "Gilgit-Baltistan", "Azad Jammu and Kashmir"], source: "report", note: "The portal's own Request Form prints the federal capital as “Islamabad”." },
  { key: "hsscNomenclature", label: "HSSC Degree Nomenclature (code)", values: ["1", "2", "3"], labels: { "1": "Intermediate With Math", "2": "A Level With Math", "3": "Intermediate With PreMedical" }, source: "template", note: "The students template asks for the numeric code." },
  { key: "courseType", label: "Course Type", values: ["Theory", "Lab"], source: "check", note: "The portal asks for theory and lab courses to be added separately." },
  { key: "facultyType", label: "Faculty Type", values: ["Local", "Foreign"], source: "report" },
  { key: "ga", label: "Graduate Attributes", values: GA_NAMES.map((_, i) => `GA-${i + 1}`), labels: Object.fromEntries(GA_NAMES.map((n, i) => [`GA-${i + 1}`, n])), source: "screenshot" },
];

export type Lists = Record<string, string[]>;
export function listsWith(overrides?: Record<string, string[]> | null): Lists {
  const out: Lists = {};
  for (const l of PORTAL_LISTS) { const o = overrides?.[l.key]; out[l.key] = o && o.length ? o : l.values; }
  return out;
}
export const listOf = (key: string) => PORTAL_LISTS.find((l) => l.key === key) || null;

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** OBEHUB's wording → the portal's spelling for that list, or null when it cannot be matched. */
export function canon(list: string, raw: string | null | undefined, lists: Lists = listsWith()): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const values = lists[list] || [];
  const exact = values.find((x) => norm(x) === norm(v));
  if (exact) return exact;
  const pick = (want: string) => values.find((x) => norm(x) === norm(want)) || null;
  const s = v.toLowerCase();
  switch (list) {
    case "academicRank":
      if (/assoc/.test(s) && /prof/.test(s)) return pick("AssociateProfessor");
      if (/assist|asst/.test(s) && /prof/.test(s)) return pick("AssistantProfessor");
      if (/prof/.test(s)) return pick("Professor");
      if (/lecturer/.test(s)) return pick("Lecturer");
      if (/teaching\s*assist|^ta$|^gta$/.test(s)) return pick("TeachingAssistant");
      if (/lab/.test(s) && /(assist|attendant|technician)/.test(s)) return pick("LabAssistant");
      if (/lab/.test(s) && /(engineer|instructor|incharge|in-charge)/.test(s)) return pick("LabInstructor");
      if (/ph\.?\s*d/.test(s) && /scholar/.test(s)) return pick("PhDScholars");
      return null;
    case "contractType":
      if (/shared/.test(s)) return pick("Shared");
      if (/visit|part|adjunct|guest/.test(s)) return pick("Visiting");
      if (/full|perman|regular|contract|tenure|tts|bps|ad.?hoc/.test(s)) return pick("FullTime");
      return null;
    case "degreeType":
      if (/ph\.?\s*d|doctor/.test(s)) return pick("PhD");
      if (/m\.?\s*phil|\bms\b|m\.s\b|\bmeng\b|\bme\b|m\.e\b|18/.test(s)) return pick("MS/MPhil");
      if (/\bbs\b|b\.s\b|\bbe\b|b\.e\b|bsc\s*\(?hons|\bbscs\b|16/.test(s) && !/master|msc|mcs|mba|\bma\b/.test(s)) return pick("BS");
      if (/master|msc|m\.sc|mcs|mba|\bma\b|\bmit\b/.test(s)) return pick("Masters");
      if (/bachelor|\bba\b|\bbsc\b|b\.sc|14/.test(s)) return pick("Bachelors");
      return null;
    case "province":
      if (/^(kp|kpk|nwfp)$|khyber|pakhtun/.test(s)) return pick("Khyber Pakhtunkhwa");
      if (/^ict$|islamabad|federal|capital/.test(s)) return pick("Islamabad");
      if (/^ajk$|azad|kashmir/.test(s)) return pick("Azad Jammu and Kashmir");
      if (/^gb$|gilgit|baltistan/.test(s)) return pick("Gilgit-Baltistan");
      if (/punjab/.test(s)) return pick("Punjab");
      if (/sindh|sind/.test(s)) return pick("Sindh");
      if (/baloch|baluch/.test(s)) return pick("Balochistan");
      return null;
    case "facultyGender": case "studentGender":
      if (/^(m|male|man)$/.test(s)) return values.find((x) => /^m/i.test(x)) || null;
      if (/^(f|female|woman)$/.test(s)) return values.find((x) => /^f/i.test(x)) || null;
      return null;
    case "hsscNomenclature": {
      const d = /^\s*([123])\b/.exec(v);
      if (d) return pick(d[1]);
      if (/a.?level/.test(s)) return pick("2");
      if (/non.?med|pre.?eng|engineering|\bics\b|computer/.test(s)) return pick("1");
      if (/pre.?med|medical|biology/.test(s)) return pick("3");
      if (/math|engineering|non.?med|ics|computer/.test(s)) return pick("1");
      return null;
    }
    case "honorific":
      if (/^prof/.test(s)) return pick("Prof");
      if (/^dr/.test(s)) return pick("Dr");
      if (/^engr|^eng\.?$/.test(s)) return pick("Engr");
      if (/^mrs/.test(s)) return pick("Mrs");
      if (/^(ms|miss)/.test(s)) return pick("Ms");
      if (/^mr/.test(s)) return pick("Mr");
      return null;
    case "courseType":
      return /lab|practical/.test(s) ? pick("Lab") : pick("Theory");
    case "facultyType":
      return /foreign|international|expat/.test(s) ? pick("Foreign") : /local|pakistan/.test(s) ? pick("Local") : null;
    default:
      return null;
  }
}

/* ---------------- Formats the portal expects ---------------- */

/** dd/mm/yyyy, yyyy-mm-dd, d-Mmm-yyyy or a bare year → a UTC date (null when it is not a date). */
export function parseDate(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCMonth() === +m[2] - 1 ? d : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})$/.exec(s);
  if (m) { const i = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase()); if (i >= 0) return new Date(Date.UTC(+m[3], i, +m[1])); }
  return null;
}
/** 13 digits written as xxxxx-xxxxxxx-x (the students template's example), or null. */
export function cnicOf(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}
/** A Pakistani mobile/landline as digits only (03001234567 / 0511234567), or an international number with its +. */
export function phoneOf(raw: string | null | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (/^92\d{9,10}$/.test(d)) return `0${d.slice(2)}`;
  if (/^0\d{9,10}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return `0${d}`;
  if (s.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}
export const emailOk = (s: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
