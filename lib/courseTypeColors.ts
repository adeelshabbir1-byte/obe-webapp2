// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Spread
// evenly around the color wheel (45° apart, same saturation/lightness for
// each) rather than picked ad hoc — the previous palette had IDS, Lab, and
// Certification all crowded within a 29° span of each other (all
// red-orange-brown), which is exactly the kind of near-identical coloring
// that defeats the purpose of color-coding by type. Kept warm and muted
// (not bright "SaaS" tones) to match the site's maroon/cream theme.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#2C578C",
  "Fundamentals": "#2C578C",
  "Major": "#2C578C", // legacy synonym, kept for courses created before the rename
  "Elective": "#2C8C31",
  "Lab": "#8C612C",
  "IDS": "#8C2C3F",
  "General Education": "#492C8C",
  "Capstone Project": "#8C2C87",
  "Field Experience": "#2C8C78",
  "Certification": "#6F8C2C",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#574C50";

// Math courses (Linear Algebra, Calculus, Probability & Statistics, etc.)
// don't have a course type of their own in this schema — different
// curricula file them under "Core"/"Major" or "IDS" depending on how
// that particular program's HEC document phrased it (some literally
// label "Calculus" as an IDS slot). That means two math courses can end
// up sharing a color with completely unrelated courses just because
// they were typed differently. Detecting by code prefix instead (MT —
// this codebase's convention for Math, see hec-bscs-2025.ts) sidesteps
// that inconsistency and gives every math course the same, distinct
// color regardless of which type it happened to be saved under.
const MATH_CODE_PREFIX = /^MT\d/i;
export const MATH_COURSE_COLOR = "#0F6E5E";

// University Electives (general, non-domain electives — e.g. a Management
// Science course open to any program) share the same courseType "Elective"
// as a domain-specific one (AI, Cyber Security, ...) in this schema, so
// there's nothing on the Course/MasterCourse record itself to tell them
// apart by type or category — only this institution's own code prefix
// convention does (MG-###, same idea as the MT-### Math override above).
const UNIV_ELECTIVE_CODE_PREFIX = /^MG\d/i;
export const UNIV_ELECTIVE_COURSE_COLOR = "#8C3C26";

// `code` is optional so every existing call site with just a type string
// (e.g. a type-only legend swatch, where there's no one course to check)
// keeps working unchanged — only call sites rendering an actual course
// need to pass its code to get the Math/University-Elective overrides.
export function courseTypeColor(type: string, code?: string): string {
  const trimmed = code?.trim();
  if (trimmed && MATH_CODE_PREFIX.test(trimmed)) return MATH_COURSE_COLOR;
  if (trimmed && UNIV_ELECTIVE_CODE_PREFIX.test(trimmed)) return UNIV_ELECTIVE_COURSE_COLOR;
  return COURSE_TYPE_COLORS[type] || COURSE_TYPE_FALLBACK_COLOR;
}

// For a legend/key that lists each distinct color actually in use (rather
// than one swatch per raw courseType) — so a batch with MG-coded
// University Electives gets its own labeled swatch instead of silently
// sharing the plain "Elective" one. Keyed by label so the caller can
// de-duplicate across many courses.
export function courseLegendEntry(type: string, code?: string): { label: string; color: string } {
  const trimmed = code?.trim();
  if (trimmed && MATH_CODE_PREFIX.test(trimmed)) return { label: "Math", color: MATH_COURSE_COLOR };
  if (trimmed && UNIV_ELECTIVE_CODE_PREFIX.test(trimmed)) return { label: "University Elective", color: UNIV_ELECTIVE_COURSE_COLOR };
  return { label: type, color: COURSE_TYPE_COLORS[type] || COURSE_TYPE_FALLBACK_COLOR };
}

// "Core", "Fundamentals", and the legacy "Major" all mean the same thing —
// use this wherever course types need to be COMPARED or MATCHED (e.g. Weight
// Policy lookups), so it doesn't matter which synonym a given course was
// saved with.
const CORE_SYNONYMS = new Set(["Core", "Fundamentals", "Major"]);
export function normalizeCourseType(type: string): string {
  return CORE_SYNONYMS.has(type) ? "Core" : type;
}
export function courseTypesMatch(a: string, b: string): boolean {
  return normalizeCourseType(a) === normalizeCourseType(b);
}
