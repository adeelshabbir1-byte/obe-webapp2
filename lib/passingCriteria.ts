import { prisma } from "./db";

export type PassingCriteria = { cloPct: number; ploPct: number };

const DEFAULT_CRITERIA: PassingCriteria = { cloPct: 50, ploPct: 50 };

export async function getPassingCriteria(chairmanId: string | null | undefined): Promise<PassingCriteria> {
  if (!chairmanId) return DEFAULT_CRITERIA;
  const criteria = await prisma.passingCriteria.findUnique({ where: { chairmanId } });
  if (!criteria) return DEFAULT_CRITERIA;
  return { cloPct: criteria.cloPassingPct, ploPct: criteria.ploPassingPct };
}
