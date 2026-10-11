import { prisma } from "./db";

// Rubrics: criteria x performance levels for one assessment item. A student's item mark is
// sum over criteria of (points of chosen level / top points of that criterion) x criterion weight %, scaled to the item's maxScore.
// A criterion counts as "attained" for a student when the chosen level reaches half of its top points or more.

export const rdb = prisma as unknown as Record<string, any>;

export type Level = { label: string; points: number; descriptor: string };
export type Criterion = { id: string; title: string; cloId: string | null; weight: number; levels: Level[] };
export type RubricRow = { id: string; instrumentId: string; courseId: string; title: string; criteriaJson: string; createdById: string; updatedAt: Date };
export type RubricScoreRow = { id: string; rubricId: string; studentId: string; levelsJson: string; comment: string | null; updatedAt: Date };

export const DEFAULT_LEVELS: Level[] = [
  { label: "Excellent", points: 4, descriptor: "" },
  { label: "Good", points: 3, descriptor: "" },
  { label: "Satisfactory", points: 2, descriptor: "" },
  { label: "Needs improvement", points: 1, descriptor: "" },
  { label: "Unsatisfactory", points: 0, descriptor: "" },
];

/** Starting criteria for common kinds of work, so nobody starts from a blank page. */
export const TEMPLATES: Record<string, { title: string; criteria: { title: string; weight: number; descriptors: string[] }[] }> = {
  Assignment: { title: "Assignment rubric", criteria: [
    { title: "Understanding of the problem", weight: 25, descriptors: ["Restates the problem precisely and identifies every requirement", "Identifies most requirements", "Identifies the main requirement only", "Misreads parts of the problem", "Problem not understood"] },
    { title: "Correctness of the solution", weight: 40, descriptors: ["Fully correct, all cases handled", "Correct with minor slips", "Partly correct", "Major errors", "Incorrect or missing"] },
    { title: "Method and justification", weight: 20, descriptors: ["Clear, well-justified steps", "Mostly justified", "Some steps unexplained", "Little justification", "None"] },
    { title: "Presentation", weight: 15, descriptors: ["Clear, well organised, referenced", "Organised", "Readable", "Hard to follow", "Unreadable"] },
  ] },
  Project: { title: "Project rubric", criteria: [
    { title: "Requirements and design", weight: 25, descriptors: ["Complete, justified design", "Sound design, small gaps", "Basic design", "Weak design", "No design"] },
    { title: "Implementation / working product", weight: 35, descriptors: ["All features work, robust", "Most features work", "Core works", "Partly works", "Does not work"] },
    { title: "Testing and evaluation", weight: 15, descriptors: ["Systematic testing with evidence", "Good testing", "Some testing", "Little testing", "None"] },
    { title: "Report and documentation", weight: 15, descriptors: ["Complete and professional", "Good", "Adequate", "Incomplete", "Missing"] },
    { title: "Teamwork and presentation", weight: 10, descriptors: ["Excellent collaboration and delivery", "Good", "Adequate", "Weak", "Poor"] },
  ] },
  Lab: { title: "Lab performance rubric", criteria: [
    { title: "Procedure followed", weight: 30, descriptors: ["Independently and safely", "With little help", "With some help", "With much help", "Could not perform"] },
    { title: "Results / output", weight: 40, descriptors: ["Correct and complete", "Mostly correct", "Partly correct", "Mostly wrong", "None"] },
    { title: "Viva / understanding", weight: 20, descriptors: ["Explains everything clearly", "Explains most", "Explains basics", "Weak explanation", "Cannot explain"] },
    { title: "Lab report", weight: 10, descriptors: ["Complete and neat", "Good", "Adequate", "Incomplete", "Missing"] },
  ] },
  Presentation: { title: "Presentation rubric", criteria: [
    { title: "Content and accuracy", weight: 40, descriptors: ["Accurate, deep", "Accurate", "Mostly accurate", "Several errors", "Inaccurate"] },
    { title: "Organisation", weight: 20, descriptors: ["Logical and engaging", "Logical", "Some order", "Hard to follow", "No structure"] },
    { title: "Delivery", weight: 20, descriptors: ["Confident, clear, on time", "Clear", "Adequate", "Hesitant", "Poor"] },
    { title: "Answering questions", weight: 20, descriptors: ["Answers all well", "Answers most", "Answers some", "Struggles", "Cannot answer"] },
  ] },
};

const newId = () => Math.random().toString(36).slice(2, 10);
export function templateCriteria(kind: string): Criterion[] {
  const t = TEMPLATES[kind] || TEMPLATES.Assignment;
  return t.criteria.map((c) => ({ id: newId(), title: c.title, cloId: null, weight: c.weight, levels: DEFAULT_LEVELS.map((l, i) => ({ ...l, descriptor: c.descriptors[i] || "" })) }));
}

export function parseCriteria(json: string | null | undefined): Criterion[] {
  try { const v = JSON.parse(json || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Cleans and checks a rubric from the editor. Returns an error message or the cleaned criteria. */
export function validateCriteria(raw: unknown, cloIds: Set<string>): { error: string } | { criteria: Criterion[] } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Add at least one criterion." };
  if (raw.length > 15) return { error: "At most 15 criteria." };
  const criteria: Criterion[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    const title = String(c.title || "").trim().slice(0, 200);
    const weight = Number(c.weight);
    if (!title) return { error: "Every criterion needs a title." };
    if (!Number.isFinite(weight) || weight <= 0) return { error: `"${title}" needs a weight above 0.` };
    const levels = (Array.isArray(c.levels) ? c.levels : []).map((l: Record<string, unknown>) => ({ label: String(l.label || "").trim().slice(0, 60), points: Number(l.points), descriptor: String(l.descriptor || "").trim().slice(0, 500) }));
    if (levels.length < 2) return { error: `"${title}" needs at least 2 levels.` };
    if (levels.some((l: Level) => !l.label || !Number.isFinite(l.points) || l.points < 0)) return { error: `Every level of "${title}" needs a name and points of 0 or more.` };
    if (Math.max(...levels.map((l: Level) => l.points)) <= 0) return { error: `"${title}" needs at least one level with points.` };
    const cloId = c.cloId && cloIds.has(String(c.cloId)) ? String(c.cloId) : null;
    criteria.push({ id: String(c.id || newId()).slice(0, 20), title, cloId, weight: Math.round(weight * 100) / 100, levels });
  }
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (Math.abs(total - 100) > 0.01) return { error: `Criterion weights add up to ${Math.round(total * 100) / 100}% — they must total 100%.` };
  return { criteria };
}

/** The item mark (out of maxScore) and per-criterion attainment for one student's chosen levels. Null when not every criterion is marked. */
export function scoreFor(criteria: Criterion[], levels: Record<string, number>, maxScore: number) {
  let pct = 0;
  const attained: Record<string, boolean> = {};
  for (const c of criteria) {
    const i = levels[c.id];
    if (i === undefined || i === null || !c.levels[i]) return null;
    const top = Math.max(...c.levels.map((l) => l.points));
    const p = c.levels[i].points / top;
    pct += p * c.weight;
    attained[c.id] = p >= 0.5;
  }
  return { score: Math.round((pct / 100) * maxScore * 100) / 100, pct: Math.round(pct * 10) / 10, attained };
}
