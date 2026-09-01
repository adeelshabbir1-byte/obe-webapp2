import { prisma } from "./db";

/**
 * An instrument's marksPct is split evenly across however many lecture rows
 * are linked to it — e.g. Midterm Q1 worth 10%, linked to 2 lecture topics
 * (as if the question has two sub-parts), gives each topic 5%, not 10% each.
 * Recomputes weightPct for every row that shares any of the given instruments,
 * since changing one row's links can change the denominator for the others.
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

export async function recomputeRowWeight(lectureRowId: string) {
  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId }, include: { instrument: true } });
  let total = 0;
  for (const link of links) {
    const count = await prisma.lectureRowInstrument.count({ where: { instrumentId: link.instrumentId } });
    total += count > 0 ? link.instrument.marksPct / count : 0;
  }
  await prisma.lectureRow.update({ where: { id: lectureRowId }, data: { weightPct: Math.round(total) } });
}
