import { prisma } from "./db";

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
  const base = Math.floor(instrument.marksPct / n);
  const remainder = instrument.marksPct - base * n; // whole points left to hand out, one each

  const ordered = [...links].sort((a, b) => a.lectureRow.lectureNumber - b.lectureRow.lectureNumber);
  ordered.forEach((l, idx) => {
    shares.set(l.lectureRowId, base + (idx < remainder ? 1 : 0));
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
 */
export async function recomputeCourseRows(courseId: string, source: "SE" | "INSTRUCTOR") {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true } });
  for (const row of rows) {
    await recomputeRowWeight(row.id);
  }
}

export async function recomputeRowWeight(lectureRowId: string) {
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId } });
  let total = 0;
  for (const link of links) {
    const shares = await instrumentShares(link.instrumentId);
    total += shares.get(lectureRowId) || 0;
  }
  await prisma.lectureRow.update({ where: { id: lectureRowId }, data: { weightPct: total } });
}
