import { prisma } from "./db";
import { coordinatorIdsFor } from "./reportScope";

type ReportUser = { id: string; role: string; managedById: string | null };
export type ReportFilter = { degree?: string; batchId?: string };

async function getBatchesFor(user: ReportUser, filter?: ReportFilter) {
  const coordinatorIds = await coordinatorIdsFor(user);
  let allBatches = await prisma.batch.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  if (filter?.batchId) allBatches = allBatches.filter((b) => b.id === filter.batchId);
  else if (filter?.degree) allBatches = allBatches.filter((b) => b.degreeProgram === filter.degree);

  // SE/Instructor see the full picture for any batch they're actually
  // involved in (a batch-wide PLO report makes sense that way), but not
  // batches they have no course in at all.
  if (user.role === "SUBJECT_EXPERT" || user.role === "INSTRUCTOR") {
    const myCourses = await prisma.course.findMany({
      where: user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { instructorId: user.id },
      select: { batchId: true },
    });
    const myBatchIds = new Set(myCourses.map((c) => c.batchId).filter((id): id is string => !!id));
    return allBatches.filter((b) => myBatchIds.has(b.id));
  }

  return allBatches;
}

// ============================================================================
// Report 1 — Program-Level PLO Coverage & Distribution Summary
// ============================================================================
export async function getCoverageReport(user: ReportUser, filter?: ReportFilter) {
  const batches = await getBatchesFor(user, filter);
  const programs = [];
  for (const batch of batches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    const rows = [];
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const byType: Record<string, number> = {};
      for (const m of mappings) byType[m.course.courseType] = (byType[m.course.courseType] || 0) + 1;
      rows.push({ number: p.number, title: p.title, status: p.status, count: mappings.length, byType });
    }
    const totalCourses = await prisma.course.count({ where: { batchId: batch.id } });
    if (totalCourses === 0 && rows.length === 0) continue;
    const notHit = rows.filter((r) => r.count === 0).length;
    const avg = rows.length ? Number((rows.reduce((s, r) => s + r.count, 0) / rows.length).toFixed(1)) : 0;
    const approved = rows.filter((r) => r.status === "approved").length;
    programs.push({ coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`, totalCourses, notHit, avg, approved, totalPlos: rows.length, rows });
  }
  return programs;
}

// ============================================================================
// Report 2 — PLO Depth & Contribution Heatmap (by course type)
// ============================================================================
export async function getHeatmapReport(user: ReportUser, filter?: ReportFilter) {
  const batches = await getBatchesFor(user, filter);
  const programs = [];
  for (const batch of batches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    const courses = await prisma.course.findMany({ where: { batchId: batch.id } });
    if (courses.length === 0 && plos.length === 0) continue;
    const courseTypes = Array.from(new Set(courses.map((c) => c.courseType))).sort();

    const matrix: Record<number, Record<string, number>> = {};
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const row: Record<string, number> = {};
      for (const t of courseTypes) row[t] = 0;
      for (const m of mappings) row[m.course.courseType] = (row[m.course.courseType] || 0) + 1;
      matrix[p.number] = row;
    }
    programs.push({ coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`, courseTypes, plos: plos.map((p) => ({ number: p.number, title: p.title })), matrix });
  }
  return programs;
}

// ============================================================================
// Report 3 — Semester-Wise PLO Progression & Balance
// ============================================================================
export async function getProgressionReport(user: ReportUser, filter?: ReportFilter) {
  const batches = await getBatchesFor(user, filter);
  const programs = [];
  for (const batch of batches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    if (plos.length === 0) continue;
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
    programs.push({ coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`, semesters, plos: plos.map((p) => ({ number: p.number, title: p.title })), matrix });
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

export async function getBloomReport(user: ReportUser, filter?: ReportFilter) {
  const batches = await getBatchesFor(user, filter);
  const programs = [];
  for (const batch of batches) {
    const courses = await prisma.course.findMany({ where: { batchId: batch.id } });
    if (courses.length === 0) continue;
    const bySemester: Record<number, Record<string, number>> = {};
    const overall: Record<string, number> = {};
    for (const b of BLOOM_ORDER) overall[b] = 0;

    for (const c of courses) {
      const clos = await prisma.cLO.findMany({ where: { courseId: c.id, source: "SE" } });
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
      coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`, totalClos, higherOrderPct,
      overall, bySemester,
    });
  }
  return programs;
}
export { BLOOM_ORDER, BLOOM_LABELS };

// ============================================================================
// Report 4 — Course-Level Accreditation Audit & Orphan Detection
// ============================================================================
export async function getAuditReport(user: ReportUser, filter?: ReportFilter) {
  const batches = await getBatchesFor(user, filter);
  const programs = [];
  for (const batch of batches) {
    const totalPlos = await prisma.pLO.count({ where: { batchId: batch.id } });
    const courses = await prisma.course.findMany({
      where: { batchId: batch.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    if (courses.length === 0) continue;
    const rows = courses.map((c) => {
      const ploCount = c.ploMappings.length;
      let flag: "orphan" | "broad" | "ok" = "ok";
      if (ploCount === 0) flag = "orphan";
      else if (totalPlos > 0 && ploCount === totalPlos) flag = "broad";
      return { code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber, ploCount, totalPlos, flag };
    });
    programs.push({
      coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`, totalPlos,
      orphanCount: rows.filter((r) => r.flag === "orphan").length,
      broadCount: rows.filter((r) => r.flag === "broad").length,
      rows,
    });
  }
  return programs;
}
