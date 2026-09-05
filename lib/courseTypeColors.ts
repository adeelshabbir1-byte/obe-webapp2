// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Chosen to
// be maximally distinct from each other (spread around the color wheel),
// not just "on brand" — similar-looking colors defeat the point of coding by type.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#2563EB",
  "Fundamentals": "#2563EB",
  "Major": "#2563EB", // legacy synonym, kept for courses created before the rename
  "Elective": "#16A34A",
  "Lab": "#EA580C",
  "IDS": "#DC2626",
  "General Education": "#7C3AED",
  "Capstone Project": "#DB2777",
  "Field Experience": "#0891B2",
  "Certification": "#CA8A04",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#64748B";

export function courseTypeColor(type: string): string {
  return COURSE_TYPE_COLORS[type] || COURSE_TYPE_FALLBACK_COLOR;
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
