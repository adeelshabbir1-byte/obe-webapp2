import { prisma } from "./db";

export async function computeResultMate(courseId: string) {
  const [enrollments, instruments, clos] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId }, include: { student: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, include: { mappedPlo: true } }),
  ]);

  const marks = await prisma.studentMark.findMany({ where: { courseId } });
  const marksByStudentInstrument = new Map<string, number>();
  for (const m of marks) marksByStudentInstrument.set(`${m.studentId}:${m.instrumentId}`, m.score);

  // Which instruments feed which CLO, via the lecture rows they're linked to.
  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrument: { courseId, source: "INSTRUCTOR" } },
    include: { lectureRow: true, instrument: true },
  });
  const instrumentToClo = new Map<string, string>(); // instrumentId -> cloId (first match)
  for (const link of links) {
    if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);
  }

  const cloCodes = clos.map((c) => c.code);
  const ploLabels = Array.from(new Set(clos.filter((c) => c.mappedPlo).map((c) => `PLO-${c.mappedPlo!.number}`)));

  const rows = enrollments.map((e) => {
    let totalPct = 0;
    const byClo: Record<string, number> = Object.fromEntries(cloCodes.map((c) => [c, 0]));
    const byPlo: Record<string, number> = Object.fromEntries(ploLabels.map((p) => [p, 0]));

    for (const inst of instruments) {
      const raw = marksByStudentInstrument.get(`${e.studentId}:${inst.id}`);
      if (raw === undefined) continue;
      const weighted = (raw / inst.maxScore) * inst.marksPct;
      totalPct += weighted;

      const cloId = instrumentToClo.get(inst.id);
      const clo = clos.find((c) => c.id === cloId);
      if (clo) {
        byClo[clo.code] = (byClo[clo.code] || 0) + weighted;
        if (clo.mappedPlo && clo.ploContributionPct) {
          const ploKey = `PLO-${clo.mappedPlo.number}`;
          byPlo[ploKey] = (byPlo[ploKey] || 0) + (weighted * clo.ploContributionPct) / 100;
        }
      }
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const rawScores: Record<string, number | null> = {};
    for (const inst of instruments) rawScores[inst.id] = marksByStudentInstrument.get(`${e.studentId}:${inst.id}`) ?? null;
    return {
      studentId: e.studentId, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat,
      totalPct: round1(totalPct), rawScores,
      byClo: Object.fromEntries(Object.entries(byClo).map(([k, v]) => [k, round1(v)])),
      byPlo: Object.fromEntries(Object.entries(byPlo).map(([k, v]) => [k, round1(v)])),
    };
  });

  // Relative grading: mean + SD based, standard scheme used across most
  // Pakistani HEC-affiliated universities. Falls back gracefully with too
  // few students (SD undefined / class of 1) by just using the mean.
  const totals = rows.map((r) => r.totalPct);
  const mean = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance = totals.length > 1 ? totals.reduce((s, t) => s + (t - mean) ** 2, 0) / (totals.length - 1) : 0;
  const sd = Math.sqrt(variance);

  function gradeFor(pct: number): string {
    if (pct >= mean + sd) return "A";
    if (pct >= mean) return "B";
    if (pct >= mean - sd) return "C";
    if (pct >= mean - 2 * sd) return "D";
    return "F";
  }

  const graded = rows.map((r) => ({ ...r, grade: gradeFor(r.totalPct) })).sort((a, b) => b.totalPct - a.totalPct);

  // Per-assessment-item average & standard deviation, for the summary row.
  const instrumentStats = instruments.map((inst) => {
    const scores = graded.map((r) => r.rawScores[inst.id]).filter((s): s is number => s !== null);
    const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    const variance = scores.length > 1 && avg !== null ? scores.reduce((s, v) => s + (v - avg) ** 2, 0) / (scores.length - 1) : 0;
    return {
      id: inst.id, type: inst.type, label: inst.label, maxScore: inst.maxScore,
      average: avg !== null ? Math.round(avg * 10) / 10 : null,
      sd: avg !== null ? Math.round(Math.sqrt(variance) * 10) / 10 : null,
    };
  });

  return {
    cloCodes, ploLabels, rows: graded, instruments: instrumentStats,
    stats: { mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10, count: totals.length },
  };
}

/** Pass/fail counts per CLO and PLO (pass = >=50% of that CLO/PLO's max
 * weighted marks), plus a histogram of the class's overall score distribution. */
export async function computeCloPloPassRates(courseId: string) {
  const result = await computeResultMate(courseId);

  const [instruments, clos] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, include: { mappedPlo: true } }),
  ]);
  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrument: { courseId, source: "INSTRUCTOR" } },
    include: { lectureRow: true },
  });
  const instrumentToClo = new Map<string, string>();
  for (const link of links) {
    if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const cloMaxWeight: Record<string, number> = {};
  for (const clo of clos) cloMaxWeight[clo.code] = 0;
  for (const inst of instruments) {
    const cloId = instrumentToClo.get(inst.id);
    const clo = clos.find((c) => c.id === cloId);
    if (clo) cloMaxWeight[clo.code] = (cloMaxWeight[clo.code] || 0) + inst.marksPct;
  }

  const ploMaxWeight: Record<string, number> = {};
  for (const label of result.ploLabels) ploMaxWeight[label] = 0;
  for (const clo of clos) {
    if (clo.mappedPlo && clo.ploContributionPct) {
      const label = `PLO-${clo.mappedPlo.number}`;
      ploMaxWeight[label] = (ploMaxWeight[label] || 0) + (cloMaxWeight[clo.code] || 0) * clo.ploContributionPct / 100;
    }
  }

  const cloStats = result.cloCodes.map((code) => {
    const max = cloMaxWeight[code] || 0;
    const threshold = max * 0.5;
    const passCount = result.rows.filter((r) => (r.byClo[code] || 0) >= threshold).length;
    return { code, maxWeight: round1(max), passCount, failCount: result.rows.length - passCount };
  });

  const ploStats = result.ploLabels.map((label) => {
    const max = ploMaxWeight[label] || 0;
    const threshold = max * 0.5;
    const passCount = result.rows.filter((r) => (r.byPlo[label] || 0) >= threshold).length;
    return { label, maxWeight: round1(max), passCount, failCount: result.rows.length - passCount };
  });

  // Histogram of overall score distribution, 10-point buckets.
  const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}-${i * 10 + 10}%`, count: 0 }));
  for (const r of result.rows) {
    const idx = Math.min(9, Math.floor(r.totalPct / 10));
    if (idx >= 0) buckets[idx].count++;
  }

  return { cloStats, ploStats, histogram: buckets, studentCount: result.rows.length };
}

/** Suggests re-weighting the instruments within a CLO — shifting weight
 * toward whichever items the class scored best on, which raises the CLO's
 * average and (generally) its pass rate. Purely a suggestion: total weight
 * for the CLO is preserved, nothing is applied automatically. */
export async function suggestClOReweighting(courseId: string) {
  const [instruments, clos, marks] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.studentMark.findMany({ where: { courseId } }),
  ]);
  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrument: { courseId, source: "INSTRUCTOR" } },
    include: { lectureRow: true },
  });
  const instrumentToClo = new Map<string, string>();
  for (const link of links) {
    if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);
  }

  const marksByInstrument = new Map<string, number[]>();
  for (const m of marks) marksByInstrument.set(m.instrumentId, [...(marksByInstrument.get(m.instrumentId) || []), m.score]);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const suggestions = clos.map((clo) => {
    const cloInstruments = instruments.filter((i) => instrumentToClo.get(i.id) === clo.id);
    if (cloInstruments.length < 2) return null; // nothing to redistribute with only one item

    const totalWeight = cloInstruments.reduce((s, i) => s + i.marksPct, 0);
    const items = cloInstruments.map((i) => {
      const scores = marksByInstrument.get(i.id) || [];
      const avgPct = scores.length > 0 ? scores.reduce((s, v) => s + v / i.maxScore, 0) / scores.length : null;
      return { id: i.id, type: i.type, label: i.label, currentWeight: i.marksPct, avgPct, gradedCount: scores.length };
    });

    const graded = items.filter((it) => it.avgPct !== null) as (typeof items[number] & { avgPct: number })[];
    if (graded.length < 2) return null; // not enough marked data yet to suggest anything meaningful

    const performanceSum = graded.reduce((s, it) => s + it.avgPct, 0) || 1;
    const suggested = items.map((it) => {
      if (it.avgPct === null) return { ...it, suggestedWeight: it.currentWeight }; // leave ungraded items alone
      const share = it.avgPct / performanceSum;
      return { ...it, suggestedWeight: round1(totalWeight * share) };
    });

    const hasMeaningfulChange = suggested.some((it) => Math.abs(it.suggestedWeight - it.currentWeight) >= 1);
    if (!hasMeaningfulChange) return null;

    return { cloCode: clo.code, totalWeight: round1(totalWeight), items: suggested };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  return suggestions;
}
