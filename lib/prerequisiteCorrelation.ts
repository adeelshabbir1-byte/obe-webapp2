import { prisma } from "./db";
import { computeResultMate } from "./resultMate";

export type PrereqPairResult = {
  prereqCode: string; prereqTitle: string; dependentCode: string; dependentTitle: string;
  studentCount: number; correlation: number | null;
  passFailCrosstab: { passedBoth: number; passedPrereqFailedDependent: number; failedPrereqPassedDependent: number; failedBoth: number };
  scatterPoints: { prereqPct: number; dependentPct: number }[];
  plo: { label: string; correlation: number | null; pointCount: number }[];
};

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null; // too few points for a meaningful correlation
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy; denomX += dx * dx; denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return null; // no variance on one side — correlation undefined, not zero
  return Math.round((num / Math.sqrt(denomX * denomY)) * 1000) / 1000;
}

/**
 * For every prerequisite link on record (Course.prerequisiteCourseId),
 * grouped across all batches by (prereq code, dependent code) — so a
 * relationship repeated across several cohorts (e.g. every BSCS batch's
 * "CS101 -> CS201" link) becomes one combined, larger-sample result
 * instead of several tiny separate ones — this finds every student who
 * took both courses (matching by studentId, valid here since a
 * prerequisite and its dependent course are within the same batch, and
 * Student records persist across that batch's semesters) and correlates
 * their performance: final percentage (Pearson correlation), a pass/
 * fail crosstab (pass = grade C or better, i.e. not D/F), and per-PLO
 * correlation wherever both courses happen to share a mapped PLO number.
 *
 * Reuses computeResultMate — the exact same per-student grade
 * computation the Instructor's own gradebook uses — rather than
 * recomputing grades a second, possibly inconsistent way.
 */
export async function computePrerequisiteCorrelations(coordinatorIds: string[]): Promise<PrereqPairResult[]> {
  const linkedCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, prerequisiteCourseId: { not: null } },
    select: { id: true, code: true, title: true, batchId: true, prerequisiteCourseId: true, prerequisiteCourse: { select: { id: true, code: true, title: true, batchId: true } } },
  });

  // Group by (prereq code, dependent code) — same course pair across
  // however many batches it repeats in.
  const groups = new Map<string, { prereqTitle: string; dependentTitle: string; instances: { prereqCourseId: string; dependentCourseId: string }[] }>();
  for (const c of linkedCourses) {
    if (!c.prerequisiteCourse) continue;
    if (c.prerequisiteCourse.batchId !== c.batchId) continue; // cross-batch prereq links aren't meaningful for a per-student join
    const key = `${c.prerequisiteCourse.code}||${c.code}`;
    if (!groups.has(key)) groups.set(key, { prereqTitle: c.prerequisiteCourse.title, dependentTitle: c.title, instances: [] });
    groups.get(key)!.instances.push({ prereqCourseId: c.prerequisiteCourse.id, dependentCourseId: c.id });
  }

  const results: PrereqPairResult[] = [];

  for (const [key, group] of groups) {
    const [prereqCode, dependentCode] = key.split("||");
    const prereqPcts: number[] = [], dependentPcts: number[] = [];
    let passedBoth = 0, passedPrereqFailedDependent = 0, failedPrereqPassedDependent = 0, failedBoth = 0;
    const scatterPoints: { prereqPct: number; dependentPct: number }[] = [];
    const ploXs = new Map<string, number[]>(), ploYs = new Map<string, number[]>();

    for (const instance of group.instances) {
      const [prereqResult, dependentResult, prereqMarkedStudentIds, dependentMarkedStudentIds] = await Promise.all([
        computeResultMate(instance.prereqCourseId),
        computeResultMate(instance.dependentCourseId),
        // computeResultMate returns a row for every ENROLLED student,
        // even ones with zero actual marks entered yet (which would
        // show as totalPct=0 — indistinguishable from a genuine
        // failing score). Only students with at least one real
        // StudentMark row are trustworthy data points here.
        prisma.studentMark.findMany({ where: { courseId: instance.prereqCourseId }, select: { studentId: true }, distinct: ["studentId"] }),
        prisma.studentMark.findMany({ where: { courseId: instance.dependentCourseId }, select: { studentId: true }, distinct: ["studentId"] }),
      ]);
      const prereqMarkedIds = new Set(prereqMarkedStudentIds.map((m) => m.studentId));
      const dependentMarkedIds = new Set(dependentMarkedStudentIds.map((m) => m.studentId));
      const prereqByStudent = new Map(prereqResult.rows.filter((r) => prereqMarkedIds.has(r.studentId)).map((r) => [r.studentId, r]));
      const dependentByStudent = new Map(dependentResult.rows.filter((r) => dependentMarkedIds.has(r.studentId)).map((r) => [r.studentId, r]));

      for (const [studentId, pRow] of prereqByStudent) {
        const dRow = dependentByStudent.get(studentId);
        if (!dRow) continue; // didn't take (or wasn't graded in) the dependent course

        prereqPcts.push(pRow.totalPct); dependentPcts.push(dRow.totalPct);
        scatterPoints.push({ prereqPct: pRow.totalPct, dependentPct: dRow.totalPct });

        const prereqPassed = pRow.grade !== "F" && pRow.grade !== "D";
        const dependentPassed = dRow.grade !== "F" && dRow.grade !== "D";
        if (prereqPassed && dependentPassed) passedBoth++;
        else if (prereqPassed && !dependentPassed) passedPrereqFailedDependent++;
        else if (!prereqPassed && dependentPassed) failedPrereqPassedDependent++;
        else failedBoth++;

        // Only PLO labels both rows actually have a value for — a course
        // whose CLOs don't map to a given PLO simply has no entry, so
        // this naturally skips PLOs that aren't shared between the two.
        for (const ploLabel of Object.keys(pRow.byPlo)) {
          if (!(ploLabel in dRow.byPlo)) continue;
          if (!ploXs.has(ploLabel)) { ploXs.set(ploLabel, []); ploYs.set(ploLabel, []); }
          ploXs.get(ploLabel)!.push(pRow.byPlo[ploLabel]);
          ploYs.get(ploLabel)!.push(dRow.byPlo[ploLabel]);
        }
      }
    }

    if (prereqPcts.length === 0) continue; // no student took both, in any batch — nothing to report

    const ploResults = Array.from(ploXs.keys()).map((label) => ({
      label, correlation: pearsonCorrelation(ploXs.get(label)!, ploYs.get(label)!), pointCount: ploXs.get(label)!.length,
    }));

    results.push({
      prereqCode, prereqTitle: group.prereqTitle, dependentCode, dependentTitle: group.dependentTitle,
      studentCount: prereqPcts.length, correlation: pearsonCorrelation(prereqPcts, dependentPcts),
      passFailCrosstab: { passedBoth, passedPrereqFailedDependent, failedPrereqPassedDependent, failedBoth },
      scatterPoints, plo: ploResults,
    });
  }

  return results.sort((a, b) => b.studentCount - a.studentCount);
}
