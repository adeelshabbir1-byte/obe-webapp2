// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent. Chosen to
// be maximally distinct from each other (spread around the color wheel),
// not just "on brand" — similar-looking colors defeat the point of coding by type.
// Palette kept warm and muted (not bright "SaaS" tones) to match the site's
// maroon/cream theme; several values reuse the theme's own azure/teal/
// purple/gold accents directly for consistency.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#3F66A0",
  "Fundamentals": "#3F66A0",
  "Major": "#3F66A0", // legacy synonym, kept for courses created before the rename
  "Elective": "#1D8A4E",
  "Lab": "#A85D1F",
  "IDS": "#963C2C",
  "General Education": "#5A4AA0",
  "Capstone Project": "#8A3A5C",
  "Field Experience": "#1F7A72",
  "Certification": "#96650F",
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
