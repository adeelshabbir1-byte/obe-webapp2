import { prisma } from "./db";

export const idb = prisma as unknown as Record<string, any>;
export const SOURCES: [string, string][] = [["direct", "Direct (assessments)"], ["courseExit", "Course-exit survey"], ["STUDENT", "Student / graduating-exit survey"], ["ALUMNI", "Alumni survey"], ["EMPLOYER", "Employer survey"]];
export const DEFAULT_WEIGHTS: Record<string, number> = { direct: 70, courseExit: 10, STUDENT: 10, ALUMNI: 5, EMPLOYER: 5 };

export async function configFor(coordinatorId: string) {
  const c = (await idb.indirectConfig.findUnique({ where: { coordinatorId } }).catch(() => null)) as { weightsJson: string; target: number } | null;
  let w = DEFAULT_WEIGHTS; try { if (c) w = { ...DEFAULT_WEIGHTS, ...JSON.parse(c.weightsJson) }; } catch { /* default */ }
  return { weights: w, target: c?.target ?? 60 };
}

type Cell = { pct: number; n: number } | null;
const pctOf = (hits: number, n: number): Cell => (n ? { pct: Math.round((1000 * hits) / n) / 10, n } : null);

/** For one cohort (batch): per PLO number, the share of evidence at or above standard from each source, and the weighted blend.
 * Direct = % of student-course PLO results passed. Indirect = % of ratings 3 or more (on a 1-5 scale). */
export async function cohortIndirect(batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true } });
  if (!batch) return null;
  const plos = await prisma.pLO.findMany({ where: { batchId }, select: { id: true, number: true, title: true }, orderBy: { number: "asc" } });
  const { weights, target } = await configFor(batch.coordinatorId);
  const acc = new Map<number, Record<string, [number, number]>>(); // number → source → [hits, n]
  const add = (num: number, src: string, hit: boolean) => { const r = acc.get(num) || {}; const c = r[src] || [0, 0]; c[0] += hit ? 1 : 0; c[1]++; r[src] = c; acc.set(num, r); };

  // Direct
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { student: { batchId } }, select: { ploAttainmentJson: true } });
  for (const r of recs) { let p: { label: string; passed?: boolean }[] = []; try { p = JSON.parse(r.ploAttainmentJson); } catch { p = []; } for (const x of p) { const n = Number(String(x.label).replace(/\D/g, "")); if (n) add(n, "direct", !!x.passed); } }

  // Course-exit (CLO self-ratings → mapped PLO)
  const courses = await prisma.course.findMany({ where: { batchId }, select: { id: true } });
  const ploNum = new Map(plos.map((p) => [p.id, p.number]));
  const clos = await prisma.cLO.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { id: true, mappedPloId: true } });
  const cloPlo = new Map(clos.map((c) => [c.id, c.mappedPloId ? ploNum.get(c.mappedPloId) : undefined]));
  const exits = ((await idb.courseExitResponse.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { ratingsJson: true } }).catch(() => [])) as { ratingsJson: string }[]);
  for (const e of exits) { let m: Record<string, number> = {}; try { m = JSON.parse(e.ratingsJson); } catch { m = {}; } for (const [cid, v] of Object.entries(m)) { const n = cloPlo.get(cid); if (n) add(n, "courseExit", Number(v) >= 3); } }

  // Stakeholder surveys run by this program's lead, matched by PLO number.
  const answers = await prisma.surveyAnswer.findMany({ where: { question: { mappedPloId: { not: null }, surveyTemplate: { coordinatorId: batch.coordinatorId } }, surveyResponse: { submittedAt: { not: null } } },
    select: { ratingValue: true, question: { select: { mappedPlo: { select: { number: true } }, surveyTemplate: { select: { stakeholderType: true } } } } } });
  for (const a of answers) { const n = a.question.mappedPlo?.number; if (n) add(n, a.question.surveyTemplate.stakeholderType, a.ratingValue >= 3); }

  const rows = plos.map((p) => {
    const r = acc.get(p.number) || {};
    const cells: Record<string, Cell> = Object.fromEntries(SOURCES.map(([k]) => [k, r[k] ? pctOf(r[k][0], r[k][1]) : null]));
    let ws = 0, s = 0; for (const [k] of SOURCES) { const c = cells[k]; if (c && weights[k] > 0) { ws += weights[k]; s += weights[k] * c.pct; } }
    const blended = ws ? Math.round((10 * s) / ws) / 10 : null;
    const ind = ["courseExit", "STUDENT", "ALUMNI", "EMPLOYER"].map((k) => cells[k]).filter((c): c is { pct: number; n: number } => !!c);
    const indAvg = ind.length ? ind.reduce((a, c) => a + c.pct, 0) / ind.length : null;
    const gap = cells.direct && indAvg !== null ? Math.round(10 * (cells.direct.pct - indAvg)) / 10 : null;
    return { number: p.number, title: p.title, cells, blended, met: blended !== null ? blended >= target : null, gap };
  });
  return { batch, rows, weights, target };
}
