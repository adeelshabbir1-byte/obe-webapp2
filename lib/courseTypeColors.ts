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
