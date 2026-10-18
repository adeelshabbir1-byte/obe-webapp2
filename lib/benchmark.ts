import { prisma } from "./db";

export type BRow = { program: string; batch: string; intake: number; course: string; courseTitle: string; term: string; year: number; grade: string; totalPct: number; gpa: number | null; cloRate: number | null; ploRate: number | null; plos: { n: number; passed: boolean }[] };

/** Finalised course results of every cohort a viewer can see, flattened for comparison and the report builder. */
export async function loadResults(batchWhere: object, max = 60000): Promise<BRow[]> {
  const batches = await prisma.batch.findMany({ where: batchWhere, select: { id: true, degreeProgram: true, batchName: true, startYear: true } });
  const bOf = new Map(batches.map((b) => [b.id, b]));
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { student: { batchId: { in: batches.map((b) => b.id) } } }, take: max,
    select: { courseCode: true, courseTitle: true, termName: true, termYear: true, grade: true, totalPct: true, gpaPoints: true, cloAttainmentJson: true, ploAttainmentJson: true, student: { select: { batchId: true } } } });
  const rate = (j: string) => { try { const a = JSON.parse(j) as { passed?: boolean }[]; return a.length ? (100 * a.filter((x) => x.passed).length) / a.length : null; } catch { return null; } };
  return recs.map((r) => {
    const b = bOf.get(r.student.batchId)!;
    let plos: { n: number; passed: boolean }[] = []; try { plos = (JSON.parse(r.ploAttainmentJson) as { label: string; passed?: boolean }[]).map((x) => ({ n: Number(String(x.label).replace(/\D/g, "")), passed: !!x.passed })).filter((x) => x.n); } catch { plos = []; }
    return { program: b.degreeProgram, batch: b.batchName, intake: b.startYear, course: r.courseCode, courseTitle: r.courseTitle, term: `${r.termName} ${r.termYear}`, year: r.termYear, grade: r.grade, totalPct: r.totalPct, gpa: r.gpaPoints, cloRate: rate(r.cloAttainmentJson), ploRate: rate(r.ploAttainmentJson), plos };
  });
}

export const DIMS: [keyof BRow, string][] = [["program", "Program"], ["batch", "Batch"], ["intake", "Intake year"], ["course", "Course"], ["term", "Term"], ["year", "Calendar year"], ["grade", "Grade"]];
export const METRICS: [string, string][] = [["count", "Results (count)"], ["avgPct", "Average marks %"], ["passPct", "Pass rate %"], ["avgGpa", "Average grade points"], ["cloRate", "CLOs met %"], ["ploRate", "GAs met %"], ["aPct", "A / A- share %"]];

const avg = (a: number[]) => (a.length ? Math.round((10 * a.reduce((x, y) => x + y, 0)) / a.length) / 10 : null);
export function metric(rows: BRow[], m: string): number | null {
  if (m === "count") return rows.length;
  if (m === "avgPct") return avg(rows.map((r) => r.totalPct));
  if (m === "passPct") return rows.length ? Math.round((1000 * rows.filter((r) => r.grade !== "F" && r.grade !== "W").length) / rows.length) / 10 : null;
  if (m === "avgGpa") { const g = rows.map((r) => r.gpa).filter((x): x is number => x !== null); return g.length ? Math.round((100 * g.reduce((a, b) => a + b, 0)) / g.length) / 100 : null; }
  if (m === "cloRate") return avg(rows.map((r) => r.cloRate).filter((x): x is number => x !== null));
  if (m === "ploRate") return avg(rows.map((r) => r.ploRate).filter((x): x is number => x !== null));
  if (m === "aPct") return rows.length ? Math.round((1000 * rows.filter((r) => r.grade === "A" || r.grade === "A-").length) / rows.length) / 10 : null;
  return null;
}

/** Group rows by up to two dimensions and compute the chosen metrics. */
export function pivot(rows: BRow[], by: (keyof BRow)[], metrics: string[]) {
  const groups = new Map<string, BRow[]>();
  for (const r of rows) { const k = by.map((d) => String(r[d])).join("\u0001"); groups.set(k, [...(groups.get(k) || []), r]); }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, rs]) => ({ keys: k.split("\u0001"), values: metrics.map((m) => metric(rs, m)) }));
}

/** PLO-by-PLO share of results met, per cohort, for year-over-year comparison of one program. */
export function ploByCohort(rows: BRow[]) {
  const cohorts = Array.from(new Set(rows.map((r) => `${r.intake}|${r.batch}`))).sort();
  const nums = Array.from(new Set(rows.flatMap((r) => r.plos.map((p) => p.n)))).sort((a, b) => a - b);
  return { cohorts: cohorts.map((c) => c.split("|")[1]), nums, grid: nums.map((n) => cohorts.map((c) => { const ps = rows.filter((r) => `${r.intake}|${r.batch}` === c).flatMap((r) => r.plos.filter((p) => p.n === n)); return ps.length ? Math.round((1000 * ps.filter((p) => p.passed).length) / ps.length) / 10 : null; })) };
}
