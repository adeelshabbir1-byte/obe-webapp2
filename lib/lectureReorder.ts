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

  const content = rows.map((r) => ({ topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct, links: linksOf.get(r.id) || [] }));
  const [moved] = content.splice(from, 1);
  content.splice(to, 0, moved);

  const lo = Math.min(from, to), hi = Math.max(from, to);
  const slots = rows.slice(lo, hi + 1);
  const ops = [
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: slots.map((s) => s.id) } } }),
    ...slots.map((s, i) => {
      const c = content[lo + i];
      return prisma.lectureRow.update({ where: { id: s.id }, data: { topic: c.topic, subtopic: c.subtopic, cloId: c.cloId, bloomLevel: c.bloomLevel, weightPct: c.weightPct } });
    }),
    prisma.lectureRowInstrument.createMany({ data: slots.flatMap((s, i) => content[lo + i].links.map((instrumentId) => ({ lectureRowId: s.id, instrumentId }))), skipDuplicates: true }),
  ];
  await prisma.$transaction(ops);
  return { rows: await prisma.lectureRow.findMany({ where: { id: { in: slots.map((s) => s.id) } } }) };
}
