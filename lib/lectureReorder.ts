import { prisma } from "./db";

// Moves one lecture's content to another slot and shifts the lectures in between by one place (like dragging a row
// in a list). Week, lecture number and date stay with the slot; topic, sub-topic, CLO, Bloom level, weight and the
// quiz/assignment/exam links travel with the content. Returns every row whose content changed.
export async function reorderLectureContent(courseId: string, source: "SE" | "INSTRUCTOR", fromId: string, toId: string) {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, orderBy: { lectureNumber: "asc" } });
  const from = rows.findIndex((r) => r.id === fromId), to = rows.findIndex((r) => r.id === toId);
  if (from < 0 || to < 0) return { error: "lecture not found" as const };
  if (from === to) return { rows: [] };

  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id) } } });
  const linksOf = new Map<string, string[]>();
  for (const l of links) linksOf.set(l.lectureRowId, [...(linksOf.get(l.lectureRowId) || []), l.instrumentId]);

  const content = rows.map((r) => ({ topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct, teachingMethod: r.teachingMethod, teachingMaterials: r.teachingMaterials, links: linksOf.get(r.id) || [] }));
  const [moved] = content.splice(from, 1);
  content.splice(to, 0, moved);

  const lo = Math.min(from, to), hi = Math.max(from, to);
  const slots = rows.slice(lo, hi + 1);
  const ops = [
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: slots.map((s) => s.id) } } }),
    ...slots.map((s, i) => {
      const c = content[lo + i];
      return prisma.lectureRow.update({ where: { id: s.id }, data: { topic: c.topic, subtopic: c.subtopic, cloId: c.cloId, bloomLevel: c.bloomLevel, weightPct: c.weightPct, teachingMethod: c.teachingMethod, teachingMaterials: c.teachingMaterials } });
    }),
    prisma.lectureRowInstrument.createMany({ data: slots.flatMap((s, i) => content[lo + i].links.map((instrumentId) => ({ lectureRowId: s.id, instrumentId }))), skipDuplicates: true }),
  ];
  await prisma.$transaction(ops);
  return { rows: await prisma.lectureRow.findMany({ where: { id: { in: slots.map((s) => s.id) } } }) };
}

/**
 * Saves a whole new order in one go. `order[k]` is the id of the row whose current content should end up in the
 * k-th slot (slots in lecture-number order). Must be a permutation of the course's rows.
 */
export async function applyLectureOrder(courseId: string, source: "SE" | "INSTRUCTOR", order: string[]) {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, orderBy: { lectureNumber: "asc" } });
  if (order.length !== rows.length || new Set(order).size !== rows.length || order.some((id) => !rows.find((r) => r.id === id))) {
    return { error: "The lecture list changed since you opened the page. Reload and try again." as const };
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const changed = rows.map((slot, k) => ({ slot, src: byId.get(order[k])! })).filter((x) => x.slot.id !== x.src.id);
  if (!changed.length) return { rows: [] };

  const links = await prisma.lectureRowInstrument.findMany({ where: { lectureRowId: { in: changed.map((x) => x.src.id) } } });
  const linksOf = new Map<string, string[]>();
  for (const l of links) linksOf.set(l.lectureRowId, [...(linksOf.get(l.lectureRowId) || []), l.instrumentId]);

  await prisma.$transaction([
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: changed.map((x) => x.slot.id) } } }),
    ...changed.map(({ slot, src }) => prisma.lectureRow.update({ where: { id: slot.id }, data: { topic: src.topic, subtopic: src.subtopic, cloId: src.cloId, bloomLevel: src.bloomLevel, weightPct: src.weightPct, teachingMethod: src.teachingMethod, teachingMaterials: src.teachingMaterials } })),
    prisma.lectureRowInstrument.createMany({ data: changed.flatMap(({ slot, src }) => (linksOf.get(src.id) || []).map((instrumentId) => ({ lectureRowId: slot.id, instrumentId }))), skipDuplicates: true }),
  ]);
  return { rows: await prisma.lectureRow.findMany({ where: { courseId, source }, orderBy: { lectureNumber: "asc" } }) };
}
