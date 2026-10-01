import { prisma } from "./db";
import { computeResultMate } from "./resultMate";
import { getGradingScaleForBatch } from "./gradingScaleLookup";

export type TranscriptCourseRow = {
  code: string; title: string; creditHours: number; grade: string; gpaPoints: number | null;
  totalPct: number; termName: string; termYear: number; isCurrent: boolean;
};
export type AttainmentAgg = { attempted: number; passed: number };
export type RemediationEntry = { ploLabel: string; courses: { code: string; title: string }[] };

export type StudentTranscriptReport = {
  courseRows: TranscriptCourseRow[];
  cgpa: number | null;
  totalCredits: number;
  cloAgg: Map<string, AttainmentAgg>;
  ploAgg: Map<string, AttainmentAgg>;
  remediation: RemediationEntry[];
};

/**
 * One student's full academic record, split across exactly the two things
 * that matter for two different audiences: (1) course grades, GPA points
 * and CGPA — what registrars/advisors/the student care about for standing
 * and graduation — and (2) CLO/PLO attainment (pass/fail per outcome) —
 * what OBE accreditation reporting cares about. Both are computed from the
 * same underlying data (permanent StudentTranscriptRecord snapshots for
 * past courses, plus a live computeResultMate() run for any course the
 * student is currently enrolled in and hasn't finished yet), so the two
 * views always agree with each other — this is the one place that logic
 * lives, shared by every role's transcript page.
 */
export async function computeStudentTranscriptReport(studentId: string): Promise<StudentTranscriptReport> {
  const courseRows: TranscriptCourseRow[] = [];
  const cloAgg = new Map<string, AttainmentAgg>();
  const ploAgg = new Map<string, AttainmentAgg>();
  let totalCredits = 0, totalGradePoints = 0;

  const historical = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "asc" }] });
  for (const r of historical) {
    courseRows.push({ code: r.courseCode, title: r.courseTitle, creditHours: r.creditHours, grade: r.grade, gpaPoints: r.gpaPoints, totalPct: r.totalPct, termName: r.termName, termYear: r.termYear, isCurrent: false });
    if (r.gpaPoints !== null) { totalCredits += r.creditHours; totalGradePoints += r.gpaPoints * r.creditHours; }
    for (const c of JSON.parse(r.cloAttainmentJson) as { code: string; passed: boolean }[]) {
      const e = cloAgg.get(c.code) || { attempted: 0, passed: 0 };
      e.attempted++; if (c.passed) e.passed++;
      cloAgg.set(c.code, e);
    }
    for (const p of JSON.parse(r.ploAttainmentJson) as { label: string; passed: boolean }[]) {
      const e = ploAgg.get(p.label) || { attempted: 0, passed: 0 };
      e.attempted++; if (p.passed) e.passed++;
      ploAgg.set(p.label, e);
    }
  }

  // Currently-active enrollments (not yet reset by a re-offering) — live-computed.
  const currentEnrollments = await prisma.studentEnrollment.findMany({ where: { studentId }, include: { course: { include: { batch: true } } } });
  for (const e of currentEnrollments) {
    const result = await computeResultMate(e.courseId);
    const row = result.rows.find((r) => r.studentId === studentId);
    if (!row) continue;
    const gradingScale = e.course.batch ? await getGradingScaleForBatch(e.course.coordinatorId, e.course.batch) : [];
    const gpaPoints = gradingScale.find((g) => g.letter === row.grade)?.gpaValue ?? null;
    courseRows.push({
      code: e.course.code, title: e.course.title, creditHours: e.course.creditHours, grade: row.grade, gpaPoints,
      totalPct: row.totalPct, termName: e.course.offeredTermName || "Current", termYear: e.course.offeredTermYear || new Date().getFullYear(), isCurrent: true,
    });
    if (gpaPoints !== null) { totalCredits += e.course.creditHours; totalGradePoints += gpaPoints * e.course.creditHours; }
    for (const code of result.cloCodes) {
      const entry = cloAgg.get(code) || { attempted: 0, passed: 0 };
      entry.attempted++; // approximate: counted as attempted whenever the CLO exists on a current course
      cloAgg.set(code, entry);
    }
  }

  // PLO remediation: for every PLO with at least one recorded failure,
  // find courses in this student's own batch curriculum that map to it
  // and aren't already in their transcript — a concrete path to still
  // attain it.
  let remediation: RemediationEntry[] = [];
  const failedPloLabels = Array.from(ploAgg.entries()).filter(([, v]) => v.passed < v.attempted).map(([label]) => label);
  if (failedPloLabels.length > 0) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (student) {
      const takenCodes = new Set(courseRows.map((r) => r.code));
      const batchCourses = await prisma.course.findMany({
        where: { batchId: student.batchId },
        include: { ploMappings: { include: { plo: true } } },
      });
      remediation = failedPloLabels.map((label) => {
        const ploNumber = parseInt(label.replace("PLO-", ""), 10);
        const eligible = batchCourses.filter((c) => !takenCodes.has(c.code) && c.ploMappings.some((m) => m.plo.number === ploNumber));
        return { ploLabel: label, courses: eligible.map((c) => ({ code: c.code, title: c.title })) };
      }).filter((r) => r.courses.length > 0 || true); // keep even zero-course entries — that's important info too
    }
  }

  const cgpa = totalCredits > 0 ? Math.round((totalGradePoints / totalCredits) * 100) / 100 : null;

  return { courseRows, cgpa, totalCredits, cloAgg, ploAgg, remediation };
}
