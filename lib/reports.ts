import { prisma } from "./db";

async function getCoordinatorsFor(chairmanId: string | null) {
  return prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId || "" },
    orderBy: { name: "asc" },
  });
}

// ============================================================================
// Report 1 — Program-Level PLO Coverage & Distribution Summary
// ============================================================================
export async function getCoverageReport(chairmanId: string | null) {
  const coordinators = await getCoordinatorsFor(chairmanId);
  const programs = [];
  for (const coord of coordinators) {
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    const rows = [];
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const byType: Record<string, number> = {};
      for (const m of mappings) byType[m.course.courseType] = (byType[m.course.courseType] || 0) + 1;
      rows.push({ number: p.number, title: p.title, status: p.status, count: mappings.length, byType });
    }
    const totalCourses = await prisma.course.count({ where: { coordinatorId: coord.id } });
    const notHit = rows.filter((r) => r.count === 0).length;
    const avg = rows.length ? Number((rows.reduce((s, r) => s + r.count, 0) / rows.length).toFixed(1)) : 0;
    const approved = rows.filter((r) => r.status === "approved").length;
    programs.push({ coordinatorName: coord.name, totalCourses, notHit, avg, approved, totalPlos: rows.length, rows });
  }
  return programs;
}

// ============================================================================
// Report 2 — PLO Depth & Contribution Heatmap (by course type)
// ============================================================================
export async function getHeatmapReport(chairmanId: string | null) {
  const coordinators = await getCoordinatorsFor(chairmanId);
  const programs = [];
  for (const coord of coordinators) {
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    const courses = await prisma.course.findMany({ where: { coordinatorId: coord.id } });
    const courseTypes = Array.from(new Set(courses.map((c) => c.courseType))).sort();

    const matrix: Record<number, Record<string, number>> = {};
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const row: Record<string, number> = {};
      for (const t of courseTypes) row[t] = 0;
      for (const m of mappings) row[m.course.courseType] = (row[m.course.courseType] || 0) + 1;
      matrix[p.number] = row;
    }
    programs.push({ coordinatorName: coord.name, courseTypes, plos: plos.map((p) => ({ number: p.number, title: p.title })), matrix });
  }
  return programs;
}

// ============================================================================
// Report 3 — Semester-Wise PLO Progression & Balance
// ============================================================================
export async function getProgressionReport(chairmanId: string | null) {
  const coordinators = await getCoordinatorsFor(chairmanId);
  const programs = [];
  for (const coord of coordinators) {
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    const semesters = [1, 2, 3, 4, 5, 6, 7, 8];

    const matrix: Record<number, Record<number, number>> = {};
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const row: Record<number, number> = {};
      for (const s of semesters) row[s] = 0;
      for (const m of mappings) {
        if (m.course.semesterNumber && m.course.semesterNumber >= 1 && m.course.semesterNumber <= 8) {
          row[m.course.semesterNumber] = (row[m.course.semesterNumber] || 0) + 1;
        }
      }
      matrix[p.number] = row;
    }
    programs.push({ coordinatorName: coord.name, semesters, plos: plos.map((p) => ({ number: p.number, title: p.title })), matrix });
  }
  return programs;
}

// ============================================================================
// Report 5 — CLO Bloom's Taxonomy Distribution (higher-order thinking check)
// ============================================================================
const BLOOM_ORDER = ["C1", "C2", "C3", "C4", "C5", "C6"];
const BLOOM_LABELS: Record<string, string> = {
  C1: "Remember", C2: "Understand", C3: "Apply", C4: "Analyze", C5: "Evaluate", C6: "Create",
};

export async function getBloomReport(chairmanId: string | null) {
  const coordinators = await getCoordinatorsFor(chairmanId);
  const programs = [];
  for (const coord of coordinators) {
    const courses = await prisma.course.findMany({ where: { coordinatorId: coord.id } });
    const bySemester: Record<number, Record<string, number>> = {};
    const overall: Record<string, number> = {};
    for (const b of BLOOM_ORDER) overall[b] = 0;

    for (const c of courses) {
      const clos = await prisma.cLO.findMany({ where: { courseId: c.id } });
      const sem = c.semesterNumber || 0;
      if (!bySemester[sem]) { bySemester[sem] = {}; for (const b of BLOOM_ORDER) bySemester[sem][b] = 0; }
      for (const clo of clos) {
        if (BLOOM_ORDER.includes(clo.bloomLevel)) {
          bySemester[sem][clo.bloomLevel]++;
          overall[clo.bloomLevel]++;
        }
      }
    }

    const totalClos = Object.values(overall).reduce((a, b) => a + b, 0);
    const higherOrderCount = (overall.C4 || 0) + (overall.C5 || 0) + (overall.C6 || 0);
    const higherOrderPct = totalClos ? Math.round((higherOrderCount / totalClos) * 100) : 0;

    programs.push({
      coordinatorName: coord.name, totalClos, higherOrderPct,
      overall, bySemester,
    });
  }
  return programs;
}
export { BLOOM_ORDER, BLOOM_LABELS };

export async function getAuditReport(chairmanId: string | null) {
  const coordinators = await getCoordinatorsFor(chairmanId);
  const programs = [];
  for (const coord of coordinators) {
    const totalPlos = await prisma.pLO.count({ where: { coordinatorId: coord.id } });
    const courses = await prisma.course.findMany({
      where: { coordinatorId: coord.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    const rows = courses.map((c) => {
      const ploCount = c.ploMappings.length;
      let flag: "orphan" | "broad" | "ok" = "ok";
      if (ploCount === 0) flag = "orphan";
      else if (totalPlos > 0 && ploCount === totalPlos) flag = "broad";
      return { code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber, ploCount, totalPlos, flag };
    });
    programs.push({
      coordinatorName: coord.name, totalPlos,
      orphanCount: rows.filter((r) => r.flag === "orphan").length,
      broadCount: rows.filter((r) => r.flag === "broad").length,
      rows,
    });
  }
  return programs;
}
