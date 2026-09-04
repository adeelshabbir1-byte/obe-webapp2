// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#5B4FE8",
  "Major": "#5B4FE8",
  "Elective": "#0D9488",
  "Lab": "#3B82F6",
  "IDS": "#F0653E",
  "General Education": "#D97706",
  "Capstone Project": "#9333EA",
  "Field Experience": "#0891B2",
  "Certification": "#DB2777",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#64748B";

export function courseTypeColor(type: string): string {
  return COURSE_TYPE_COLORS[type] || COURSE_TYPE_FALLBACK_COLOR;
}
