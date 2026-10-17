import { prisma } from "./db";

/** Project / Lab items measured against a CLO directly (not through lecture topics): instrumentId → cloId. */
export async function directClos(courseIds: string | string[]): Promise<Map<string, string>> {
  const ids = Array.isArray(courseIds) ? courseIds : [courseIds];
  try {
    const rows = await prisma.assessmentInstrument.findMany({ where: { courseId: { in: ids }, cloId: { not: null } }, select: { id: true, cloId: true } });
    return new Map(rows.map((r) => [r.id, r.cloId as string]));
  } catch { return new Map(); } // column not added yet
}
