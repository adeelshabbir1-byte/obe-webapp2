import { prisma } from "./db";
import { r4, usableBestOf, splitEvenly } from "./assessmentWeights";
import { recomputeCourseRows } from "./lectureWeights";

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
const splitHundredths = splitEvenly;

/**
 * If the SE lowers a count (6 quizzes -> 4), the extra items are removed, newest first, along with their topic links,
 * and every lecture topic they were tied to has its weight recomputed. Returns how many were removed.
 */
async function trimInstrumentCount(courseId: string, source: "SE" | "INSTRUCTOR", type: string, desiredCount: number): Promise<number> {
  const existing = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type }, orderBy: { createdAt: "asc" } });
  // Items that already have student marks are never trimmed (that would fail on the marks link and lose data).
  const marked = new Set<string>((await prisma.studentMark.findMany({ where: { instrumentId: { in: existing.map((i: { id: string }) => i.id) } }, select: { instrumentId: true }, distinct: ["instrumentId"] })).map((m: { instrumentId: string }) => m.instrumentId));
  const extra = existing.slice(desiredCount).filter((i: { id: string }) => !marked.has(i.id));
  if (extra.length === 0) return 0;
  const ids = extra.map((i: { id: string }) => i.id);
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: { in: ids } } });
  const rowIds = Array.from(new Set<string>(links.map((l: { lectureRowId: string }) => l.lectureRowId)));
  await prisma.$transaction([
    prisma.lectureRowInstrument.deleteMany({ where: { instrumentId: { in: ids } } }),
    prisma.instrumentEvidence.deleteMany({ where: { instrumentId: { in: ids } } }),
    prisma.assessmentInstrument.deleteMany({ where: { id: { in: ids } } }),
  ]);
  if (rowIds.length > 0) await recomputeCourseRows(courseId, source);
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
    const parts = splitHundredths(categoryTargetPct, left.length);
    for (let i = 0; i < left.length; i++) await prisma.assessmentInstrument.update({ where: { id: left[i].id }, data: { marksPct: parts[i] } });
    await recomputeCourseRows(courseId, source);
  }

  const existing = await prisma.assessmentInstrument.findMany({ where: { courseId, source, type } });
  const missing = desiredCount - existing.length;
  if (missing <= 0) {
    // Same count but the category weight changed (e.g. Midterm 30 -> 25): scale the items so they add to the new target again.
    const sum = existing.reduce((s, i) => s + i.marksPct, 0);
    const ordered = [...existing].sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
    const marks = ordered.map((i) => i.marksPct);
    // Items that were split evenly (all within a hundredth or a tenth of each other) are re-split with the current rule,
    // so 3.34 / 3.33 / 3.33 becomes 3.3 / 3.3 / 3.4. Items the SE set by hand to different values are only scaled.
    if (categoryTargetPct > 0 && ordered.length > 1 && Math.max(...marks) - Math.min(...marks) <= 0.11) {
      const parts = splitEvenly(categoryTargetPct, ordered.length);
      if (parts.some((p, i) => Math.abs(p - marks[i]) > 0.0001)) {
        for (let i = 0; i < ordered.length; i++) await prisma.assessmentInstrument.update({ where: { id: ordered[i].id }, data: { marksPct: parts[i] } });
        await recomputeCourseRows(courseId, source);
      }
      return;
    }
    if (categoryTargetPct > 0 && existing.length > 0 && Math.abs(sum - categoryTargetPct) > 0.01) {
      const totalHund = Math.round(categoryTargetPct * 100);
      const scaled = existing.map((i) => Math.floor((i.marksPct / (sum || 1)) * totalHund));
      let rest = totalHund - scaled.reduce((a, b) => a + b, 0);
      for (let i = 0; rest > 0; i = (i + 1) % scaled.length, rest--) scaled[i]++;
      for (let i = 0; i < existing.length; i++) await prisma.assessmentInstrument.update({ where: { id: existing[i].id }, data: { marksPct: scaled[i] / 100 } });
      await recomputeCourseRows(courseId, source);
    }
    return;
  }

  const existingSum = existing.reduce((s, i) => s + i.marksPct, 0);
  const remaining = Math.max(0, categoryTargetPct - existingSum);
  const parts = splitHundredths(remaining, missing);

  const isNumbered = type === "Midterm" || type === "Final";
  for (let i = 0; i < missing; i++) {
    // Next free number (not count + 1), so deleting Q2 and adding one never produces two items called "5".
    const used = existing.map((e) => parseInt(String(e.label).replace(/\D+/g, ""), 10)).filter((x) => Number.isFinite(x));
    const n = (used.length ? Math.max(...used) : 0) + 1 + i;
    const label = isNumbered ? String(n) : `${type} ${n}`;
    const marksPct = parts[i];
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
