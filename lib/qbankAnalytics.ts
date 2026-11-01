import { prisma } from "./db";
import { items, courseCtx, planOfCourse } from "./qbank";
import { readiness } from "./qbankCore";

// Question bank analytics (Part 6, build C §12) and the bank readiness warning (§11): per course the approved
// questions per CLO, Bloom level and difficulty against the target; the questions most often flagged; contributions.

/** One course's shortfall: fewer than the target of approved questions per CLO per Bloom level its plan uses. */
export async function shortfallOf(courseId: string) {
  const ctx = await courseCtx(courseId);
  const plan = await planOfCourse(ctx.baseId);
  const used = plan.clos.map((c) => ({ clo: c.code, bloom: c.bloomLevel || "C2" }));
  const its = await items(ctx.chairmanId, ctx.codes);
  return { ctx, items: its, short: readiness(its, used) };
}

export async function bankAnalytics(chairmanId: string, courses: { id: string; code: string; title: string }[]) {
  const seen = new Set<string>();
  const coverage: { code: string; title: string; approved: number; easy: number; medium: number; hard: number; perCloBloom: Record<string, number>; short: { clo: string; bloom: string; have: number }[] }[] = [];
  const all: { id: string; code: string; text: string; flags: string[]; used: number; authorId: string; status: string }[] = [];
  for (const c of courses) {
    if (seen.has(c.code)) continue; seen.add(c.code);
    const s = await shortfallOf(c.id).catch(() => null); if (!s) continue;
    const ok = s.items.filter((x) => x.status === "APPROVED");
    const per: Record<string, number> = {};
    for (const q of ok) for (const clo of q.cloCodes) per[`${clo} ${q.bloom}`] = (per[`${clo} ${q.bloom}`] || 0) + 1;
    coverage.push({ code: c.code, title: c.title, approved: ok.length, easy: ok.filter((q) => q.difficulty === "EASY").length, medium: ok.filter((q) => q.difficulty === "MEDIUM").length, hard: ok.filter((q) => q.difficulty === "HARD").length, perCloBloom: per, short: s.short });
    for (const q of s.items) if (!q.mcq) all.push({ id: q.id, code: c.code, text: q.text, flags: q.flags || [], used: q.usedCount, authorId: q.authorId, status: q.status });
  }
  const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.map((x) => x.authorId))) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const by = new Map<string, { name: string; added: number; approved: number }>();
  for (const q of all) { const k = q.authorId; const r = by.get(k) || { name: names.get(k) || "", added: 0, approved: 0 }; r.added++; if (q.status === "APPROVED") r.approved++; by.set(k, r); }
  void chairmanId;
  return { coverage, flagged: all.filter((q) => q.flags.length).sort((a, b) => b.flags.length - a.flags.length || b.used - a.used).slice(0, 25), contributions: Array.from(by.values()).sort((a, b) => b.added - a.added) };
}

/** The readiness warning: offered courses whose bank is below the target (it never blocks anything). */
export async function bankWarnings(courses: { id: string; code: string }[]) {
  const out: { courseId: string; code: string; text: string }[] = []; const seen = new Set<string>();
  for (const c of courses.slice(0, 40)) {
    if (seen.has(c.code)) continue; seen.add(c.code);
    const s = await shortfallOf(c.id).catch(() => null);
    if (s?.short.length) out.push({ courseId: c.id, code: c.code, text: s.short.slice(0, 4).map((x) => `${x.clo} ${x.bloom}: ${x.have} of 3`).join(", ") + (s.short.length > 4 ? ` +${s.short.length - 4}` : "") });
  }
  return out;
}
