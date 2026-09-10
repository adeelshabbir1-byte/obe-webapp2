const TERM_LETTER: Record<string, string> = { FALL: "F", SPRING: "S", SUMMER: "U", WINTER: "W" };

/** Abbreviates a degree program name to its meaningful initials, dropping
 * generic prefixes like "BS"/"BSc"/"MS". "BS Computer Science" -> "CS",
 * "BS Software Engineering" -> "SE". */
function abbreviateDegree(degreeProgram: string): string {
  const words = degreeProgram
    .replace(/^\s*(BS|BSc|BE|MS|MSc|PhD)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return degreeProgram.slice(0, 4).toUpperCase();
  return words.map((w) => w[0].toUpperCase()).join("");
}

/** "BS Computer Science", "Fall", 2026 -> "CS-F-26" */
export function shortSectionCode(degreeProgram: string, termName: string | null, termYear: number | null): string {
  const degree = abbreviateDegree(degreeProgram);
  const term = termName ? (TERM_LETTER[termName.toUpperCase()] || termName[0].toUpperCase()) : "?";
  const year = termYear ? String(termYear).slice(-2) : "??";
  return `${degree}-${term}-${year}`;
}
