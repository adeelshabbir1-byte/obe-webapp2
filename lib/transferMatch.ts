import { prisma } from "./db";
import { subjectKey } from "./courseHomeCore";

// Suggested equivalences for transfer credit lines (Adeel prompt §33): the strongest signal is the same course code or
// the same HEC / council catalog course (same subject key); then title overlap. The Program Lead decides; strong
// matches can be accepted together (each still checked by decideCredit's grade / % rules).
const sdb = prisma as unknown as Record<string, any>;
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["and", "the", "for", "introduction"].includes(w)));
export type Suggestion = { creditId: string; fromCode: string; fromTitle: string; ch: number; grade: string | null; status: string; toCode: string | null; best: { code: string; title: string; label: "Strong (same code)" | "Strong (same HEC course)" | "Likely" | "Weak"; score: number } | null };

export async function suggestionsFor(requestId: string): Promise<{ batchId: string | null; rows: Suggestion[] }> {
  const credits = ((await sdb.studentTransferCredit?.findMany({ where: { requestId } }).catch(() => [])) || []) as { id: string; studentId: string; fromCode: string; fromTitle: string; creditHours: number; grade: string | null; status: string; toCode: string | null }[];
  if (!credits.length) return { batchId: null, rows: [] };
  const req = await sdb.studentStatusRequest.findUnique({ where: { id: requestId } });
  const st = await prisma.student.findUnique({ where: { id: credits[0].studentId }, select: { batchId: true } });
  const batchId = req?.type === "TRANSFER_INTERNAL" ? req.targetBatchId : st?.batchId || null;
  const courses = batchId ? await prisma.course.findMany({ where: { batchId }, select: { code: true, title: true, creditHours: true } }) : [];
  const rows = credits.map((c) => {
    let best: Suggestion["best"] = null;
    for (const co of courses) {
      let label: NonNullable<Suggestion["best"]>["label"], score: number;
      if (co.code.trim().toUpperCase() === c.fromCode.trim().toUpperCase()) { label = "Strong (same code)"; score = 100; }
      else if (subjectKey(co.title) === subjectKey(c.fromTitle)) { label = "Strong (same HEC course)"; score = 95; }
      else { const a = words(co.title), b = words(c.fromTitle); const inter = Array.from(a).filter((w) => b.has(w)).length; const j = inter / Math.max(1, new Set([...Array.from(a), ...Array.from(b)]).size); score = Math.round(j * 80) + (co.creditHours === c.creditHours ? 10 : 0); label = score >= 50 ? "Likely" : "Weak"; }
      if (!best || score > best.score) best = { code: co.code, title: co.title, label, score };
    }
    return { creditId: c.id, fromCode: c.fromCode, fromTitle: c.fromTitle, ch: c.creditHours, grade: c.grade, status: c.status, toCode: c.toCode, best: best && best.score >= 30 ? best : null };
  });
  return { batchId, rows };
}
