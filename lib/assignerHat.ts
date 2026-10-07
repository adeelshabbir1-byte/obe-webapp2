import { prisma } from "./db";

// A teacher can be given the Course Assigner role for one semester ("Fall 2026") or until it is removed ("ALWAYS").
export const termLabel = (t: { termName: string; year: number }) => `${t.termName} ${t.year}`;
export function nextTermLabel(t: { termName: string; year: number }) {
  return t.termName === "Fall" ? `Spring ${t.year + 1}` : `Fall ${t.year}`;
}

/** The institute's current semester: the most recently set one among its Program Leads. */
export async function instituteTerm(chairmanId: string) {
  return prisma.currentTerm.findFirst({ where: { coordinator: { managedById: chairmanId } }, orderBy: { updatedAt: "desc" } });
}

/** Does this person hold the Course Assigner hat right now? */
export async function assignerHatActive(assignerTerm: string | null | undefined, chairmanId: string) {
  if (!assignerTerm) return false;
  if (assignerTerm === "ALWAYS") return true;
  const t = await instituteTerm(chairmanId);
  return !!t && termLabel(t) === assignerTerm;
}
