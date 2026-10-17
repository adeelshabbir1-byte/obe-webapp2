import { prisma } from "./db";
import { parseCriteria, type Criterion } from "./rubrics";

export const DIRECT_TYPES = ["Project", "Lab"];

/** Set (or clear) the CLO a Project / Lab item measures directly. */
export async function setDirectClo(courseId: string, source: "SE" | "INSTRUCTOR", instrumentId: string, cloId: string | null) {
  const inst = await prisma.assessmentInstrument.findFirst({ where: { id: instrumentId, courseId, source } });
  if (!inst) return "Assessment not found.";
  if (!DIRECT_TYPES.includes(inst.type)) return "Only Project and Lab items are mapped to a CLO directly; others follow their lecture topics.";
  if (cloId && !(await prisma.cLO.count({ where: { id: cloId, courseId, source } }))) return "That CLO is not part of this plan.";
  await prisma.assessmentInstrument.update({ where: { id: inst.id }, data: { cloId } });
  return null;
}

/** Split a Project / Lab into parts, one per CLO. The original stays as a 0% container (it keeps its rubric). */
export async function splitInstrument(courseId: string, source: "SE" | "INSTRUCTOR", instrumentId: string, parts: { cloId: string; marksPct: number }[]) {
  const inst = await prisma.assessmentInstrument.findFirst({ where: { id: instrumentId, courseId, source } });
  if (!inst) return "Assessment not found.";
  if (!DIRECT_TYPES.includes(inst.type)) return "Only Project and Lab items can be split into parts.";
  if (await prisma.assessmentInstrument.count({ where: { partOfId: inst.id } })) return "This item is already split — change its parts instead.";
  if (parts.length < 2) return "Choose at least two CLOs.";
  const clos = await prisma.cLO.findMany({ where: { courseId, source, id: { in: parts.map((p) => p.cloId) } }, select: { id: true, code: true } });
  if (clos.length !== parts.length) return "Choose different CLOs of this plan for each part.";
  const sum = parts.reduce((s, p) => s + p.marksPct, 0);
  if (parts.some((p) => !(p.marksPct > 0)) || Math.abs(sum - inst.marksPct) > 0.011) return `The parts must add up to the item's ${inst.marksPct}% (they add up to ${Math.round(sum * 100) / 100}%).`;
  if (await prisma.studentMark.count({ where: { instrumentId: inst.id } }) && !(await (prisma as unknown as Record<string, any>).rubric.count({ where: { instrumentId: inst.id } }).catch(() => 0))) return "Marks are already entered for this item. Split it before marking, or clear its marks first.";
  const code = new Map(clos.map((c) => [c.id, c.code]));
  await prisma.$transaction([
    prisma.assessmentInstrument.update({ where: { id: inst.id }, data: { marksPct: 0, cloId: null } }),
    prisma.assessmentInstrument.createMany({ data: parts.map((p) => ({ courseId, source, type: inst.type, label: `${inst.label} — ${code.get(p.cloId)}`, marksPct: Math.round(p.marksPct * 10000) / 10000, maxScore: inst.maxScore, cloId: p.cloId, partOfId: inst.id })) }),
  ]);
  return null;
}

/** Undo a split: parts are removed (only if unmarked) and the item gets its full weight back. */
export async function unsplitInstrument(courseId: string, source: "SE" | "INSTRUCTOR", instrumentId: string) {
  const parts = await prisma.assessmentInstrument.findMany({ where: { partOfId: instrumentId, courseId, source } });
  if (!parts.length) return "This item is not split.";
  if (await prisma.studentMark.count({ where: { instrumentId: { in: parts.map((p) => p.id) } } })) return "Marks are already entered for its parts.";
  const total = parts.reduce((s, p) => s + p.marksPct, 0);
  await prisma.$transaction([
    prisma.assessmentInstrument.deleteMany({ where: { id: { in: parts.map((p) => p.id) } } }),
    prisma.assessmentInstrument.update({ where: { id: instrumentId }, data: { marksPct: Math.round(total * 10000) / 10000 } }),
  ]);
  return null;
}

/** Share of a rubric's weight per CLO (criteria without a CLO are left out). */
export function rubricCloShares(criteria: Criterion[]) {
  const by = new Map<string, number>();
  for (const c of criteria) if (c.cloId) by.set(c.cloId, (by.get(c.cloId) || 0) + (Number(c.weight) || 0));
  return by;
}

/** One student's mark on each part, from the rubric levels of that part's CLO's criteria. */
export function partScore(criteria: Criterion[], levels: Record<string, number>, cloId: string, maxScore: number) {
  const mine = criteria.filter((c) => c.cloId === cloId);
  if (!mine.length || mine.some((c) => levels[c.id] === undefined)) return null;
  const w = mine.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 1;
  const pct = mine.reduce((s, c) => { const top = Math.max(...c.levels.map((l) => l.points)) || 1; return s + ((c.levels[levels[c.id]]?.points || 0) / top) * (Number(c.weight) || 0); }, 0) / w;
  return Math.round(pct * maxScore * 100) / 100;
}

/** After a rubric score is saved: write the marks of the item's parts too. */
export async function writePartMarks(instrumentId: string, courseId: string, studentId: string, criteriaJson: string, levels: Record<string, number>, enteredById: string) {
  const parts = await prisma.assessmentInstrument.findMany({ where: { partOfId: instrumentId } });
  const criteria = parseCriteria(criteriaJson);
  for (const p of parts) {
    if (!p.cloId) continue;
    const score = partScore(criteria, levels, p.cloId, p.maxScore);
    if (score === null) continue;
    await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId, instrumentId: p.id } }, update: { score, enteredById }, create: { studentId, courseId, instrumentId: p.id, score, enteredById } });
  }
}
