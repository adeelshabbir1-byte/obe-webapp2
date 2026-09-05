// Best-effort extraction of a course list from curriculum PDF text. This is
// NOT a reliable universal parser — different institutions format their
// documents differently — so results are meant to be reviewed and completed
// by the Super Admin in the curriculum editor, not trusted blindly.

export type ParsedCourse = { code: string; title: string; creditHours: number | null; category: string | null };

const COURSE_LINE = /([A-Z]{2,6}-\d{2,4}(?:-L)?)\s+([A-Za-z][A-Za-z0-9 &/,()\-'’]{3,80}?)\s+(?:[A-Za-z0-9,\-\s]{0,40}?\s+)?(\d{1,2})\s*\(\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/g;

// Recognized category-header keywords (checked against text seen just above
// a run of matched course lines) — mapped to this system's course types.
const CATEGORY_HINTS: { pattern: RegExp; category: string }[] = [
  { pattern: /general education/i, category: "General Education" },
  { pattern: /core|fundamental/i, category: "Core" },
  { pattern: /elective|specialization/i, category: "Elective" },
  { pattern: /interdisciplinary|allied/i, category: "IDS" },
  { pattern: /final year project|capstone/i, category: "Capstone Project" },
  { pattern: /certification/i, category: "Certification" },
  { pattern: /internship|field experience/i, category: "Field Experience" },
];

export function parseCurriculumText(text: string): ParsedCourse[] {
  const lines = text.split("\n");
  const results: ParsedCourse[] = [];
  const seenCodes = new Set<string>();
  let currentCategory: string | null = null;

  // Scan line-by-line so we can track the most recent category heading,
  // then run the course-row regex against the whole block for reliability
  // across PDFs where a single course sometimes wraps two lines.
  const joined = lines.join("\n");
  let match: RegExpExecArray | null;
  const regex = new RegExp(COURSE_LINE);
  while ((match = regex.exec(joined)) !== null) {
    const [, code, titleRaw, creditStr] = match;
    if (seenCodes.has(code)) continue;

    // Find the nearest category heading before this match's position.
    const before = joined.slice(Math.max(0, match.index - 400), match.index);
    for (const hint of CATEGORY_HINTS) {
      if (hint.pattern.test(before.slice(-200))) currentCategory = hint.category;
    }

    const title = titleRaw.replace(/\s+/g, " ").trim().replace(/[.,;:\-]+$/, "");
    const creditHours = parseInt(creditStr, 10);
    if (title.length < 3 || isNaN(creditHours) || creditHours < 1 || creditHours > 6) continue;

    seenCodes.add(code);
    results.push({ code, title, creditHours, category: currentCategory });
  }

  return results;
}
