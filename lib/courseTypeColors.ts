// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Every type
// gets its own clearly different hue (no two types share a colour family),
// kept light and airy to match the sky-blue OBEHUB theme while staying dark
// enough for white text on top.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#1F7FE0",
  "Fundamentals": "#1F7FE0",
  "Major": "#1F7FE0", // legacy synonym, kept for courses created before the rename
  "Elective": "#0F9D6E",
  "Lab": "#E0701F",
  "IDS": "#D94C7A",
  "General Education": "#5F6BE0",
  "Capstone Project": "#A452C4",
  "Field Experience": "#0F9A9A",
  "Certification": "#B7791F",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#5B7090";

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
