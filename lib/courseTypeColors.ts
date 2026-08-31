// Shared across the PLO report and matrix so a course type always renders
// with the same color, making the two views visually consistent.
export const COURSE_TYPE_COLORS: Record<string, string> = {
  "Core": "#A8823C",
  "Elective": "#4B7A63",
  "Lab": "#5B7C99",
  "IDS": "#B1512E",
  "General Education": "#8A6B2E",
  "Capstone Project": "#7A5B8F",
  "Field Experience": "#4B8F87",
};
export const COURSE_TYPE_FALLBACK_COLOR = "#8B8571";

export function courseTypeColor(type: string): string {
  return COURSE_TYPE_COLORS[type] || COURSE_TYPE_FALLBACK_COLOR;
}
