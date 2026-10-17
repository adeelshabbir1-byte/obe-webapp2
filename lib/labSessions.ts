import { prisma } from "./db";
import { parseCriteria, type Criterion } from "./rubrics";

const ldb = prisma as unknown as Record<string, any>;

/** CLOs a lab session can measure: the theory course's (Instructor copy) when the lab feeds it, else the lab course's own. */
export async function labCloOptions(labId: string, theoryId: string | null) {
  const pick = async (courseId: string) => {
    const ins = await prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, statement: true } });
    return ins.length ? ins : prisma.cLO.findMany({ where: { courseId, source: "SE" }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, statement: true } });
  };
  return theoryId ? pick(theoryId) : pick(labId);
}

export type LabSession = { labNumber: number; title: string; cloId: string | null; criteria: Criterion[] | null; maxScore: number };

export async function labSessions(labId: string): Promise<LabSession[]> {
  const [manuals, marks] = await Promise.all([
    ldb.labManual.findMany({ where: { courseId: labId }, orderBy: { labNumber: "asc" } }).catch(() => []) as Promise<{ labNumber: number; title: string; cloId?: string | null; criteriaJson?: string | null }[]>,
    prisma.labMark.findMany({ where: { courseId: labId }, select: { labNumber: true, maxScore: true }, distinct: ["labNumber"] }),
  ]);
  const max = new Map(marks.map((m) => [m.labNumber, m.maxScore]));
  const nums = Array.from(new Set([...manuals.map((m) => m.labNumber), ...marks.map((m) => m.labNumber)])).sort((a, b) => a - b);
  return nums.map((n) => { const m = manuals.find((x) => x.labNumber === n); const c = m?.criteriaJson ? parseCriteria(m.criteriaJson) : null; return { labNumber: n, title: m?.title || `Lab ${n}`, cloId: m?.cloId || null, criteria: c && c.length ? c : null, maxScore: max.get(n) || 10 }; });
}
