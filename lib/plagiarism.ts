import { rdb, type Who } from "./registers";
import { REVIEW_ROLES } from "./reviewScope";

// Plagiarism records (HEC Plagiarism Policy): each final year project, thesis or research paper's similarity report,
// checked against HEC's limits — overall similarity below 19% and no single source above 5% (excluding references
// and quotations) — with the decision and the action taken. The limits are kept on each record so a stricter
// departmental limit can be used.

export const PLAG_HINT = "Plagiarism records need prisma/migration_plagiarism.sql — run it in Supabase.";
export const KINDS: Record<string, string> = { FYP: "Final year project", THESIS: "Thesis / dissertation", PAPER: "Research paper" };
export const DECISIONS: Record<string, string> = { ACCEPTED: "Accepted", REVISE: "Returned for revision", REJECTED: "Rejected", MISCONDUCT: "Referred as misconduct" };
export const HEC_LIMIT = 19, SINGLE_SOURCE_LIMIT = 5;
export type Plag = { id: string; chairmanId: string; kind: string; title: string; program: string | null; authors: string; fypGroupId: string | null; supervisorId: string | null; tool: string; similarityPct: number; singleSourcePct: number | null; thresholdPct: number; decision: string; actionTaken: string | null; reportFileName: string | null; checkedAt: Date; createdById: string; createdAt: Date };
export const overLimit = (p: { similarityPct: number; singleSourcePct: number | null; thresholdPct: number }) => p.similarityPct >= p.thresholdPct || (p.singleSourcePct ?? 0) > SINGLE_SOURCE_LIMIT;
/** Staff who review results see all records; a teacher sees the ones they recorded or supervise. */
export const canSeeAllPlag = (w: Who) => REVIEW_ROLES.includes(w.role) || w.qec;

export async function plagOf(w: Who) {
  try {
    return (await rdb.plagiarismRecord.findMany({ where: { chairmanId: w.chairmanId, ...(canSeeAllPlag(w) ? {} : { OR: [{ createdById: w.id }, { supervisorId: w.id }] }) }, select: { id: true, chairmanId: true, kind: true, title: true, program: true, authors: true, fypGroupId: true, supervisorId: true, tool: true, similarityPct: true, singleSourcePct: true, thresholdPct: true, decision: true, actionTaken: true, reportFileName: true, checkedAt: true, createdById: true, createdAt: true }, orderBy: { checkedAt: "desc" } })) as Plag[];
  } catch { return null; }
}

/** Per year and kind: how many were checked, the average similarity, how many were over the limit and what was done. */
export function plagSummary(rows: Plag[]) {
  const key = (r: Plag) => `${new Date(r.checkedAt).getFullYear()}|${r.kind}`;
  const groups = new Map<string, Plag[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) || []), r]);
  return Array.from(groups.entries()).map(([k, rs]) => { const [year, kind] = k.split("|"); return { year: Number(year), kind, checked: rs.length, average: Math.round((10 * rs.reduce((t, r) => t + r.similarityPct, 0)) / rs.length) / 10, over: rs.filter(overLimit).length, revised: rs.filter((r) => r.decision === "REVISE").length, rejected: rs.filter((r) => r.decision === "REJECTED").length, misconduct: rs.filter((r) => r.decision === "MISCONDUCT").length }; }).sort((a, b) => b.year - a.year || a.kind.localeCompare(b.kind));
}
