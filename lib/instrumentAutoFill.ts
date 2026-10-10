import { prisma } from "./db";
import { r4, usableBestOf } from "./assessmentWeights";
import { recomputeRowWeight } from "./lectureWeights";

/**
 * Tops up one assessment type (Quiz, Assignment, Midterm, Final, Project,
 * Lab) to the SE's desired item count — called right after Assessment
 * Weights are saved, so by the time the SE reaches the Assessments &
 * Submit tab, the right number of Quiz/Assignment/exam-question rows
 * already exist instead of having to be added one by one.
 *
 * Never touches an existing instrument's marksPct — only the NEWLY added
 * ones are filled in, splitting whatever's left of the category's target
 * % (target minus what's already assigned to existing instruments) evenly
 * across just the new rows, using a largest-remainder split so they add
 * up to exactly the leftover amount (no per-row rounding drift, same fix
 * as the lecture-weight split). If desiredCount is at or below how many
 * already exist, this does nothing — it only ever adds, never removes,
 * so nothing the SE already customized is touched or deleted.
 */
/**
 * If the SE lowers a count (6 quizzes -> 4), the extra items are removed, newest first, along with their topic links,
 * and every lecture topic they were tied to has its weight recomputed. Returns how many were removed.
 */
async function trimInstrumentCount(courseId: string, source: "SE" | "INSTRUCTOR", type: string, desiredCount: number): Promise<number> {
  const existing = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type }, orderBy: { createdAt: "asc" } });
  const extra = existing.slice(desiredCount);
  if (extra.length === 0) return 0;
  const ids = extra.map((i: { id: string }) => i.id);
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: { in: ids } } });
  const rowIds = Array.from(new Set<string>(links.map((l: { lectureRowId: string }) => l.lectureRowId)));
  await prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: { in: ids } } });
  await prisma.instrumentEvidence.deleteMany({ where: { instrumentId: { in: ids } } });
  await prisma.assessmentInstrument.deleteMany({ where: { id: { in: ids } } });
  for (const rowId of rowIds) await recomputeRowWeight(rowId);
  return extra.length;
}

export async function ensureInstrumentCount(
  courseId: string,
  source: "SE" | "INSTRUCTOR",
  type: string,
  desiredCount: number,
  categoryTargetPct: number
) {
  if (!desiredCount || desiredCount <= 0) return;

  const removed = await trimInstrumentCount(courseId, source, type, desiredCount);
  if (removed > 0) {
    // The remaining items now carry the whole category weight, split evenly (whole points, remainder to the first ones).
    const left = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type }, orderBy: { createdAt: "asc" } });
    const target = Math.round(categoryTargetPct);
    const base = Math.floor(target / left.length), rem = target - base * left.length;
    for (let i = 0; i < left.length; i++) await prisma.assessmentInstrument.update({ where: { id: left[i].id }, data: { marksPct: base + (i < rem ? 1 : 0) } });
    for (const row of await prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true } })) await recomputeRowWeight(row.id);
  }

  const existing = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type } });
  const missing = desiredCount - existing.length;
  if (missing <= 0) return;

  const existingSum = existing.reduce((s, i) => s + i.marksPct, 0);
  const remaining = Math.max(0, categoryTargetPct - existingSum);
  const base = Math.floor(remaining / missing);
  const remainder = remaining - base * missing; // leftover whole points, one each to the first N new rows

  const isNumbered = type === "Midterm" || type === "Final";
  for (let i = 0; i < missing; i++) {
    const n = existing.length + i + 1;
    const label = isNumbered ? String(n) : `${type} ${n}`;
    const marksPct = base + (i < remainder ? 1 : 0);
    await prisma.assessmentInstrument.create({ data: { courseId, source, type, label, marksPct, maxScore: 10 } });
  }
}

const TYPES_WITH_TARGET_KEY: { type: string; targetKey: string; countKey: string }[] = [
  { type: "Assignment", targetKey: "assignmentPct", countKey: "assignmentCount" },
  { type: "Quiz", targetKey: "quizPct", countKey: "quizCount" },
  { type: "Project", targetKey: "projectPct", countKey: "projectCount" },
  { type: "Lab", targetKey: "labPct", countKey: "labCount" },
  { type: "Midterm", targetKey: "midtermPct", countKey: "midtermCount" },
  { type: "Final", targetKey: "finalPct", countKey: "finalCount" },
];

/**
 * "Best K of N" categories (quizzes, assignments): every item carries target / K, so the best K add up to exactly the target
 * (best 3 of 4 quizzes worth 10 -> 3.33 each). Creates missing items and re-sets the weight of all of them.
 */
async function ensureBestOf(courseId: string, source: "SE" | "INSTRUCTOR", type: string, count: number, target: number, k: number) {
  await trimInstrumentCount(courseId, source, type, count);
  const existing = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type }, orderBy: { createdAt: "asc" } });
  const each = r4(target / k);
  for (let n = existing.length + 1; n <= count; n++) {
    await prisma.assessmentInstrument.create({ data: { courseId, source, type, label: `${type} ${n}`, marksPct: each, maxScore: 10 } });
  }
  const ids = existing.map((i) => i.id);
  if (ids.length) await prisma.assessmentInstrument.updateMany({ where: { id: { in: ids } }, data: { marksPct: each } });
}

/** Runs ensureInstrumentCount for every category at once, from a course's own saved %'s and counts. */
export async function ensureAllInstrumentCounts(courseId: string, source: "SE" | "INSTRUCTOR", course: Record<string, any>) {
  for (const { type, targetKey, countKey } of TYPES_WITH_TARGET_KEY) {
    const desiredCount = course[countKey];
    if (!desiredCount) continue;
    const bestOf = type === "Quiz" ? course.quizBestOf : type === "Assignment" ? course.assignmentBestOf : null;
    const k = usableBestOf(bestOf, desiredCount);
    if (k) await ensureBestOf(courseId, source, type, desiredCount, course[targetKey] || 0, k);
    else await ensureInstrumentCount(courseId, source, type, desiredCount, course[targetKey] || 0);
  }
}
