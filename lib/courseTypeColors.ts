// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Every type
// gets its own clearly different hue (no two types share a colour family),
// tuned to sit with the Emerald Prestige theme while staying dark enough
// for white text on top.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#038666",
  "Fundamentals": "#038666",
  "Major": "#038666", // legacy synonym, kept for courses created before the rename
  "Elective": "#2E7FB8",
  "Lab": "#E0701F",
  "IDS": "#D94C7A",
  "General Education": "#5F6BE0",
  "Capstone Project": "#A452C4",
  "Field Experience": "#B7791F",
  "Certification": "#6E8B2F",
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
