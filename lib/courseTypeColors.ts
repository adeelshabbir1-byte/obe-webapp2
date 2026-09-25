// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Every type
// gets its own clearly different hue from the OBEHUB palette (no two types
// share a colour family), dark enough for white text on top.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#1A40EA",
  "Fundamentals": "#1A40EA",
  "Major": "#1A40EA", // legacy synonym, kept for courses created before the rename
  "Elective": "#059669",
  "Lab": "#EA580C",
  "IDS": "#DB2777",
  "General Education": "#5E16F0",
  "Capstone Project": "#C026D3",
  "Field Experience": "#0D9488",
  "Certification": "#B45309",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#46507A";

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
