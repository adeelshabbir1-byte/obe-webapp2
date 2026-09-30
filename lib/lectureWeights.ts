import { prisma } from "./db";

/**
 * An instrument's marksPct is split evenly across however many lecture rows
 * are linked to it — e.g. Midterm Q1 worth 10%, linked to 2 lecture topics
 * (as if the question has two sub-parts), gives each topic 5%, not 10% each.
 * Recomputes weightPct for every row CURRENTLY linked to any of the given
 * instruments, since changing one row's links can change the denominator
 * for the others.
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

export async function recomputeRowWeight(lectureRowId: string) {
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId }, include: { instrument: true } });
  let total = 0;
  for (const link of links) {
    const count = await prisma.lectureRowInstrument.count({ where: { instrumentId: link.instrumentId } });
    total += count > 0 ? link.instrument.marksPct / count : 0;
  }
  await prisma.lectureRow.update({ where: { id: lectureRowId }, data: { weightPct: Math.round(total) } });
}
