import { prisma } from "./db";

export async function computeResultMate(courseId: string) {
  const [enrollments, instruments, clos] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId }, include: { student: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
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
    return {
      studentId: e.studentId, name: e.student.name, rollNumber: e.student.rollNumber, isRepeat: e.isRepeat,
      totalPct: round1(totalPct), byClo: Object.fromEntries(Object.entries(byClo).map(([k, v]) => [k, round1(v)])),
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

  return {
    cloCodes, ploLabels, rows: graded,
    stats: { mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10, count: totals.length },
  };
}
