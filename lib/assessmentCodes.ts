// Short column headings for assessment items: A1, A2 (assignments), Q1 (quizzes), P1 (projects), L1 (lab tasks),
// MQ1 (midterm question 1), FQ1 (final question 1). The full name is kept for tooltips.

const PREFIX: Record<string, string> = { Assignment: "A", Quiz: "Q", Project: "P", Lab: "L", Midterm: "MQ", Final: "FQ", Presentation: "PR", Viva: "V" };
const TYPE_ORDER = ["Assignment", "Quiz", "Project", "Lab", "Presentation", "Viva", "Midterm", "Final"];

/** Midterm and Final items are exam-paper questions: marks are usually entered one student at a time across the questions. */
export const isPaperType = (type: string) => type === "Midterm" || type === "Final";

const numberIn = (label: string): number | null => {
  const m = /(\d+)(?!.*\d)/.exec(label || "");
  return m ? parseInt(m[1], 10) : null;
};

/** Short code for one item; `fallbackNumber` (1-based position within its type) is used when the label has no number. */
export function shortCode(type: string, label: string, fallbackNumber: number): string {
  const prefix = PREFIX[type] || (type ? type[0].toUpperCase() : "X");
  return `${prefix}${numberIn(label) ?? fallbackNumber}`;
}

/** Readable name for a tooltip: "Assignment 1", "Midterm question 3". */
export function fullName(type: string, label: string): string {
  if (isPaperType(type)) return `${type} question ${numberIn(label) ?? label}`;
  return label && label.toLowerCase().startsWith(type.toLowerCase()) ? label : `${type} ${label}`.trim();
}

/** Assignments, quizzes, projects, labs, then the midterm and final questions, each in number order. */
export function orderItems<T extends { type: string; label: string }>(items: T[]): T[] {
  const rank = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? TYPE_ORDER.length : i; };
  return [...items].sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type) || (numberIn(a.label) ?? 0) - (numberIn(b.label) ?? 0) || a.label.localeCompare(b.label));
}

/** Items in display order with their short code and full name. */
export function withCodes<T extends { type: string; label: string }>(items: T[]): (T & { code: string; name: string })[] {
  const seen = new Map<string, number>();
  return orderItems(items).map((i) => {
    const n = (seen.get(i.type) || 0) + 1;
    seen.set(i.type, n);
    return { ...i, code: shortCode(i.type, i.label, n), name: fullName(i.type, i.label) };
  });
}
