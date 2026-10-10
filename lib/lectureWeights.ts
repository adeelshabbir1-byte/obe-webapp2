import { prisma } from "./db";
import { coverageWeight } from "./assessmentWeights";

type Inst = { id: string; courseId: string; source: string; type: string; marksPct: number };
type BestOf = { quizBestOf: number | null; assignmentBestOf: number | null };
/** The weight an instrument adds to the lecture plan. Under best-of each item counts target / N, so the plan still adds to the category target. */
function planWeight(i: Inst, all: Inst[], c: BestOf | null): number {
  const k = i.type === "Quiz" ? c?.quizBestOf : i.type === "Assignment" ? c?.assignmentBestOf : null;
  const count = all.filter((x) => x.courseId === i.courseId && x.source === i.source && x.type === i.type).length;
  return coverageWeight(i.marksPct, k, count);
}
/** Split a weight over n rows in hundredths so the shares add back to exactly the weight. */
function splitShares(weight: number, n: number): number[] {
  const units = Math.round(weight * 100);
  const base = Math.floor(units / n);
  const rem = units - base * n;
  return Array.from({ length: n }, (_, idx) => (base + (idx < rem ? 1 : 0)) / 100);
}

/**
 * An instrument's marksPct is split across however many lecture rows are
 * linked to it — e.g. Midterm Q1 worth 10%, linked to 3 lecture topics,
 * should give those 3 topics a combined 10%. It almost never divides
 * evenly (10 / 3 = 3.33 each): rounding each row's share independently —
 * the old approach — loses or gains a point or two on every split that
 * isn't exact, and that loss/gain compounds across every instrument in
 * the course. That is what was pushing totals to 96%, 141%, or anywhere
 * but 100%, and why two lecture rows carrying what should be an identical
 * share could end up showing different numbers.
 *
 * Fix (instrumentShares, below): every row linked to an instrument gets
 * floor(marksPct / linkedRowCount), and the leftover whole-point
 * remainder is handed out one point at a time (ordered by lecture number,
 * so it's deterministic) until it's gone. The shares always add back up
 * to exactly marksPct, and a row's weightPct is just the sum of its
 * already-whole-number shares across every instrument it's linked to —
 * no further rounding anywhere.
 */
async function instrumentShares(instrumentId: string): Promise<Map<string, number>> {
  const [instrument, links] = await Promise.all([
    prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } }),
    prisma.lectureRowInstrument.findMany({
      where: { instrumentId },
      include: { lectureRow: { select: { id: true, lectureNumber: true } } },
    }),
  ]);
  const shares = new Map<string, number>();
  if (!instrument || links.length === 0) return shares;

  const n = links.length;
  const [siblings, course] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: instrument.courseId, source: instrument.source, type: instrument.type }, select: { id: true, courseId: true, source: true, type: true, marksPct: true } }),
    prisma.course.findUnique({ where: { id: instrument.courseId }, select: { quizBestOf: true, assignmentBestOf: true } }),
  ]);
  const parts = splitShares(planWeight(instrument as unknown as Inst, siblings as unknown as Inst[], course as unknown as BestOf | null), n);

  const ordered = [...links].sort((a, b) => a.lectureRow.lectureNumber - b.lectureRow.lectureNumber);
  ordered.forEach((l, idx) => {
    shares.set(l.lectureRowId, parts[idx]);
  });
  return shares;
}

/**
 * Recomputes weightPct for every row CURRENTLY linked to any of the given
 * instruments, since changing one row's links can change the split for
 * all the others.
 *
 * IMPORTANT: this only finds rows the instrument is still linked to right
 * now — a row whose link was just REMOVED (unchecked, or a question number
 * cleared/changed) won't show up in that lookup any more, so it never gets
 * recomputed back down and is left showing its old, stale weight forever.
 * Callers that add/remove links must also call recomputeRows() directly
 * with every lectureRowId actually touched, not rely on this alone.
 */
export async function recomputeAffectedRows(instrumentIds: string[]) {
  const rowIds = new Set<string>();
  for (const instrumentId of instrumentIds) {
    const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId } });
    for (const l of links) rowIds.add(l.lectureRowId);
  }
  for (const rowId of rowIds) {
    await recomputeRowWeight(rowId);
  }
}

/**
 * Recomputes weightPct for exactly the given lecture rows — use this
 * (instead of, or alongside, recomputeAffectedRows) whenever a row's own
 * instrument links were added or removed, so a row that just lost its last
 * link gets recomputed down to 0 instead of keeping its previous weight.
 */
export async function recomputeRows(lectureRowIds: string[]) {
  for (const rowId of new Set(lectureRowIds)) {
    await recomputeRowWeight(rowId);
  }
}

/**
 * Recomputes every lecture row in one course (one source side — SE or
 * INSTRUCTOR) with the current logic. Called automatically whenever that
 * course's Assessments/Instruments tab is opened, so stale weight numbers
 * left over from an older, buggy version of this logic heal themselves
 * the moment someone looks at the page — nobody has to notice, ask an
 * admin, or run a manual fix for it.
 *
 * Runs as a handful of batched queries instead of one query per row per
 * linked instrument (recomputeRowWeight/instrumentShares, called one row
 * at a time, is fine for a single row touched by an edit — but awaited
 * sequentially across every row in a course on every single page load, it
 * turns into hundreds of individually-awaited round trips and the page
 * just hangs for a course with any real number of lecture rows).
 */
/** Writes row weights in ONE statement, and only for rows whose weight actually changed (a transaction of N updates costs N round trips). */
async function writeRowWeights(rows: { id: string; weightPct: number }[], next: Map<string, number>) {
  const changed = rows.filter((r) => Math.abs(r.weightPct - (next.get(r.id) ?? 0)) > 0.0001);
  if (changed.length === 0) return;
  const params: (string | number)[] = [];
  const tuples = changed.map((r, i) => { params.push(r.id, next.get(r.id) ?? 0); return `($${i * 2 + 1}::text, $${i * 2 + 2}::float8)`; });
  await prisma.$executeRawUnsafe(
    `UPDATE "LectureRow" AS t SET "weightPct" = v.w FROM (VALUES ${tuples.join(",")}) AS v(id, w) WHERE t.id = v.id`,
    ...params,
  );
}

export async function recomputeCourseRows(courseId: string, source: "SE" | "INSTRUCTOR") {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true, weightPct: true } });
  if (rows.length === 0) return;
  const rowIds = rows.map((r) => r.id);

  const links = await prisma.lectureRowInstrument.findMany({
    where: { lectureRowId: { in: rowIds } },
    include: { lectureRow: { select: { id: true, lectureNumber: true } } },
  });
  if (links.length === 0) {
    // No instrument links at all — every row's weight should read 0.
    await writeRowWeights(rows, new Map());
    return;
  }

  const instrumentIds = Array.from(new Set(links.map((l) => l.instrumentId)));
  const instruments = await prisma.assessmentInstrument.findMany({ where: { id: { in: instrumentIds } } });
  const [courseInstruments, courseBest] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true, courseId: true, source: true, type: true, marksPct: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { quizBestOf: true, assignmentBestOf: true } }),
  ]);
  const marksPctById = new Map<string, number>(instruments.map((i) => [i.id as string, planWeight(i as unknown as Inst, courseInstruments as unknown as Inst[], courseBest as unknown as BestOf | null)]));

  const linksByInstrument = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByInstrument.get(l.instrumentId) || [];
    arr.push(l);
    linksByInstrument.set(l.instrumentId, arr);
  }

  // Same floor + leftover-remainder split as instrumentShares(), computed
  // in memory for every instrument at once instead of one DB round trip
  // per instrument per row.
  const totalByRow = new Map<string, number>();
  for (const id of rowIds) totalByRow.set(id, 0);
  for (const [instrumentId, instrumentLinks] of linksByInstrument) {
    const marksPct = marksPctById.get(instrumentId);
    if (marksPct == null) continue;
    const n = instrumentLinks.length;
    const parts = splitShares(marksPct, n);
    const ordered = [...instrumentLinks].sort((a, b) => a.lectureRow.lectureNumber - b.lectureRow.lectureNumber);
    ordered.forEach((l, idx) => {
      const share = parts[idx];
      totalByRow.set(l.lectureRowId, (totalByRow.get(l.lectureRowId) || 0) + share);
    });
  }

  await writeRowWeights(rows, new Map(rowIds.map((id) => [id, Math.round((totalByRow.get(id) || 0) * 100) / 100] as [string, number])));
}

export async function recomputeRowWeight(lectureRowId: string) {
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId } });
  let total = 0;
  for (const link of links) {
    const shares = await instrumentShares(link.instrumentId);
    total += shares.get(lectureRowId) || 0;
  }
  await prisma.lectureRow.update({ where: { id: lectureRowId }, data: { weightPct: Math.round(total * 100) / 100 } });
}
