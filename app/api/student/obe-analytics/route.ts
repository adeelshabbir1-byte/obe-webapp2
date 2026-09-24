import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { getPassingCriteria } from "../../../../lib/passingCriteria";

type PloAttainmentEntry = { label: string; pct: number; passed: boolean };

function parsePloLabel(label: string): number | null {
  const m = label.match(/^PLO-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export async function GET() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId }, include: { coordinator: true } });
  if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });

  const [transcriptRecords, realPlos, criteria] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId: student.id }, orderBy: [{ termYear: "asc" }, { termName: "asc" }] }),
    prisma.pLO.findMany({ where: { batchId: batch.id } }),
    getPassingCriteria(batch.coordinator.managedById),
  ]);

  const realPloByNumber = new Map(realPlos.map((p) => [p.number, p]));

  // Aggregate every PLO seen across every completed course into one
  // overall attainment number — simple average across the courses that
  // actually touched that PLO, not weighted by credit hours, since
  // attainment is a competency measure, not a grade.
  const sums = new Map<number, { totalPct: number; count: number }>();
  for (const t of transcriptRecords) {
    let entries: PloAttainmentEntry[] = [];
    try { entries = JSON.parse(t.ploAttainmentJson); } catch { continue; }
    for (const e of entries) {
      const num = parsePloLabel(e.label);
      if (num === null) continue;
      const cur = sums.get(num) || { totalPct: 0, count: 0 };
      cur.totalPct += e.pct; cur.count += 1;
      sums.set(num, cur);
    }
  }

  const overallByPlo = Array.from(sums.entries()).map(([number, { totalPct, count }]) => {
    const avgPct = totalPct / count;
    const real = realPloByNumber.get(number);
    return {
      number, title: real?.title || `PLO-${number}`, avgPct, coursesContributing: count,
      lagging: avgPct < criteria.ploPct,
    };
  }).sort((a, b) => a.number - b.number);

  const laggingNumbers = new Set(overallByPlo.filter((p) => p.lagging).map((p) => p.number));

  // Improvement roadmap: future (not-yet-taken) courses in the
  // student's own batch whose own CLOs (the Subject Expert's plan)
  // contribute to one of the currently-lagging PLOs.
  const takenCourseCodes = new Set(transcriptRecords.map((t) => t.courseCode));
  const futureCourses = laggingNumbers.size > 0
    ? await prisma.course.findMany({
        where: { batchId: batch.id, code: { notIn: Array.from(takenCourseCodes) }, semesterNumber: { gte: student.currentSemesterNumber } },
        include: { clos: { where: { source: "SE", mappedPloId: { not: null } }, include: { mappedPlo: true } } },
      })
    : [];

  const roadmap = futureCourses
    .map((c) => {
      const touchedLaggingPlos = Array.from(new Set(c.clos.filter((clo) => clo.mappedPlo && laggingNumbers.has(clo.mappedPlo.number)).map((clo) => clo.mappedPlo!.number)));
      return { courseId: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber, touchedLaggingPlos };
    })
    .filter((c) => c.touchedLaggingPlos.length > 0)
    .sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99));

  // Risk heatmap: past terms' actual per-PLO attainment, term by term —
  // shows exactly which semester/course combination first under-attained
  // a given PLO, not just the overall average.
  const heatmapByTerm = new Map<string, { termLabel: string; termYear: number; plos: Record<number, number> }>();
  for (const t of transcriptRecords) {
    let entries: PloAttainmentEntry[] = [];
    try { entries = JSON.parse(t.ploAttainmentJson); } catch { continue; }
    const key = `${t.termName} ${t.termYear}`;
    if (!heatmapByTerm.has(key)) heatmapByTerm.set(key, { termLabel: key, termYear: t.termYear, plos: {} });
    const row = heatmapByTerm.get(key)!;
    for (const e of entries) {
      const num = parsePloLabel(e.label);
      if (num === null) continue;
      // If multiple courses in the same term touch the same PLO, keep the lower (more concerning) figure.
      row.plos[num] = row.plos[num] !== undefined ? Math.min(row.plos[num], e.pct) : e.pct;
    }
  }

  return NextResponse.json({
    ploPassingThreshold: criteria.ploPct,
    overallByPlo,
    roadmap,
    heatmap: Array.from(heatmapByTerm.values()).sort((a, b) => a.termYear - b.termYear),
    allPloNumbers: realPlos.map((p) => p.number).sort((a, b) => a - b),
  });
}
