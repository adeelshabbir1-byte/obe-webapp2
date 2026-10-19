import { randomUUID } from "crypto";
import { prisma } from "./db";

// Written questions (short, long, problem) per course code, each tagged with its CLO, Bloom level and marks; the MCQ
// bank already exists. "Draft a paper" picks questions to reach the total marks with every chosen CLO covered in
// proportion and a spread of Bloom levels — a starting point the teacher edits, then sends to paper vetting.

const qdb = prisma as unknown as Record<string, any>;
export const BLOOMS = ["C1", "C2", "C3", "C4", "C5", "C6", "P1", "P2", "P3", "A1", "A2"];
export const QB_HINT = "The question bank needs prisma/migration_platform_plus.sql — run it in Supabase.";
export type Q = { id: string; courseCode: string; cloCode: string; bloom: string; kind: string; marks: number; text: string; createdById: string; usedCount: number };

export async function questions(chairmanId: string, courseCode: string): Promise<Q[] | null> {
  try { return await qdb.questionBankItem.findMany({ where: { chairmanId, courseCode, active: true }, orderBy: [{ cloCode: "asc" }, { bloom: "asc" }] }); } catch { return null; }
}
export async function addQuestion(chairmanId: string, q: Omit<Q, "id" | "usedCount">) {
  await qdb.questionBankItem.create({ data: { id: randomUUID(), chairmanId, ...q, usedCount: 0, active: true, createdAt: new Date() } });
}
export async function removeQuestion(chairmanId: string, id: string) { await qdb.questionBankItem.updateMany({ where: { id, chairmanId }, data: { active: false } }); }

/** Pick questions for a paper: marks per CLO in proportion, least-used first, higher Bloom levels mixed in. */
export function draftPaper(bank: Q[], clos: string[], total: number) {
  const pool = bank.filter((q) => clos.includes(q.cloCode));
  const per = clos.map((c) => ({ c, target: Math.round(total / clos.length) }));
  const chosen: Q[] = [];
  const gaps: string[] = [];
  for (const { c, target } of per) {
    let got = 0;
    const qs = pool.filter((q) => q.cloCode === c).sort((a, b) => a.usedCount - b.usedCount || b.bloom.localeCompare(a.bloom));
    // alternate high and low Bloom levels for a spread
    const ordered: Q[] = [];
    let lo = qs.length - 1, hi = 0;
    while (hi <= lo) { ordered.push(qs[hi++]); if (hi <= lo) ordered.push(qs[lo--]); }
    for (const q of ordered) if (got + q.marks <= target) { chosen.push(q); got += q.marks; }
    if (got < target) gaps.push(`${c}: ${got} of ${target} marks — add more ${c} questions`);
  }
  return { chosen, total: chosen.reduce((a, q) => a + q.marks, 0), gaps };
}
export async function markUsed(ids: string[]) { await qdb.questionBankItem.updateMany({ where: { id: { in: ids } }, data: { usedCount: { increment: 1 } } }).catch(() => {}); }
