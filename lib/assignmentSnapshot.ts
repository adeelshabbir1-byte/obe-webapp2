import { prisma } from "./db";
import { directClos } from "./directClo";
import { getPassingCriteria } from "./passingCriteria";

/** Call BEFORE overwriting a course's offeredTermName/Year — if it already
 * had a different term set, permanently snapshots its current section
 * assignments (and direct instructor) so that history isn't lost. */
export async function snapshotCourseAssignmentsIfTermChanging(courseId: string, newTermName: string, newTermYear: number) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { batch: true, instructor: true, sectionAssignments: { include: { instructor: true } } },
  });
  if (!course || !course.offeredTermName || !course.offeredTermYear) return;
  if (course.offeredTermName === newTermName && course.offeredTermYear === newTermYear) return; // same term, nothing to preserve

  const courseLabel = `${course.code} — ${course.title}`;
  const batchLabel = course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—";

  const rows: { instructorName: string; sectionCount: number }[] = [];
  if (course.sectionAssignments.length > 0) {
    for (const a of course.sectionAssignments) rows.push({ instructorName: a.instructor.name, sectionCount: a.sectionCount });
  } else if (course.instructor) {
    rows.push({ instructorName: course.instructor.name, sectionCount: 1 });
  }
  if (rows.length === 0) return; // nothing was actually assigned, nothing to preserve

  await prisma.assignmentSnapshot.createMany({
    data: rows.map((r) => ({
      coordinatorId: course.coordinatorId, courseLabel, courseType: course.courseType, batchLabel,
      termName: course.offeredTermName!, termYear: course.offeredTermYear!,
      instructorName: r.instructorName, sectionCount: r.sectionCount,
    })),
  });
}

/** Call BEFORE overwriting a course's offeredTermName/Year — snapshots the
 * outgoing term's CLO/PLO attainment (for later comparison), THEN clears
 * StudentMark and StudentEnrollment for this course so the new term starts
 * clean and never mixes with the old students' marks. Safe to call even if
 * no marks exist yet (nothing to snapshot or clear). */
export async function snapshotAttainmentAndResetIfTermChanging(courseId: string, newTermName: string, newTermYear: number) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } });
  if (!course || !course.offeredTermName || !course.offeredTermYear) return;
  if (course.offeredTermName === newTermName && course.offeredTermYear === newTermYear) return;

  const enrollmentCount = await prisma.studentEnrollment.count({ where: { courseId } });
  if (enrollmentCount === 0) return; // nothing to snapshot or reset

  const coordinator = await prisma.user.findUnique({ where: { id: course.coordinatorId } });
  const criteria = await getPassingCriteria(coordinator?.managedById, undefined, { degreeProgram: course.batch?.degreeProgram });

  const { computeCloPloPassRates } = await import("./resultMate");
  const stats = await computeCloPloPassRates(courseId, criteria);

  if (stats.studentCount > 0) {
    await prisma.attainmentSnapshot.create({
      data: {
        coordinatorId: course.coordinatorId,
        courseLabel: `${course.code} — ${course.title}`,
        termName: course.offeredTermName, termYear: course.offeredTermYear,
        studentCount: stats.studentCount,
        cloStatsJson: JSON.stringify(stats.cloStats),
        ploStatsJson: JSON.stringify(stats.ploStats),
        histogramJson: JSON.stringify(stats.histogram),
      },
    });
  }

  // A lab whose marks went into its theory course has no transcript line of its own; the theory course's line
  // carries the lab's credit hours too (lib/labTheory.ts).
  const { labGoesIntoTheory, mergedLabCredits } = await import("./labTheory");
  const intoTheory = course.courseType === "Lab" && (await labGoesIntoTheory(courseId).catch(() => false));
  const labCredits = course.courseType === "Lab" ? 0 : await mergedLabCredits(courseId).catch(() => 0);

  // Preserve each individual student's grade and CLO/PLO attainment before
  // their marks get wiped below — this is what makes a per-student
  // transcript possible across multiple semesters.
  // The merged lab is recorded as "IT" (included in theory): 0 credit hours and no grade points, so it shows as done
  // in the degree audit without a grade or credits of its own.
  if (intoTheory) {
    const enrolled = await prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { studentId: true } });
    if (enrolled.length) await prisma.studentTranscriptRecord.createMany({ data: enrolled.map((e) => ({ studentId: e.studentId, coordinatorId: course.coordinatorId, courseCode: course.code, courseTitle: course.title, creditHours: 0, courseType: course.courseType, termName: course.offeredTermName!, termYear: course.offeredTermYear!, totalPct: 0, grade: "IT", gpaPoints: null, cloAttainmentJson: "[]", ploAttainmentJson: "[]" })) });
  }
  if (!intoTheory) await snapshotStudentTranscripts(courseId, {
    coordinatorId: course.coordinatorId, code: course.code, title: course.title,
    creditHours: course.creditHours + labCredits, courseType: course.courseType,
    offeredTermName: course.offeredTermName, offeredTermYear: course.offeredTermYear,
    batch: course.batch ? { startTerm: course.batch.startTerm, startYear: course.batch.startYear } : null,
  }, criteria);

  // Students the Advisor dropped mid-semester don't go through
  // computeResultMate (excluded there so a drop takes effect immediately),
  // so they need their own transcript entry here: a "W" grade, no GPA
  // points (never affects CGPA), so the course surfaces on "Courses
  // Remaining" as dropped rather than just vanishing with no record.
  const withdrawn = intoTheory ? [] : await prisma.studentEnrollment.findMany({ where: { courseId, status: "WITHDRAWN" } });
  if (withdrawn.length > 0) {
    await prisma.studentTranscriptRecord.createMany({
      data: withdrawn.map((w) => ({
        studentId: w.studentId, coordinatorId: course.coordinatorId,
        courseCode: course.code, courseTitle: course.title, creditHours: course.creditHours + labCredits, courseType: course.courseType,
        termName: course.offeredTermName!, termYear: course.offeredTermYear!,
        totalPct: 0, grade: "W", gpaPoints: null,
        cloAttainmentJson: "[]", ploAttainmentJson: "[]",
      })),
    });
  }

  // Clear marks and enrollment so the new term's students start fresh —
  // otherwise auto-enrollment would add new students on top of the old
  // ones, mixing two semesters' marks together in one Result Mate view.
  await prisma.studentMark.deleteMany({ where: { courseId } });
  await prisma.labMark.deleteMany({ where: { courseId } });
  await prisma.studentEnrollment.deleteMany({ where: { courseId } });
  // The next offering starts with a fresh result: close this offering's approval and grade changes (kept as history,
  // but no longer applied, so a student who repeats the course is graded on the new marks).
  try {
    const { db } = await import("./resultApproval");
    await db.gradeChangeRequest.updateMany({ where: { courseId, status: "APPROVED" }, data: { status: "APPLIED" } });
    await db.gradeChangeRequest.updateMany({ where: { courseId, status: "PENDING" }, data: { status: "CLOSED" } });
    await db.courseResult.deleteMany({ where: { courseId } });
  } catch { /* result approval tables not created yet */ }
}

/** Snapshots each individual enrolled student's grade and CLO/PLO
 * attainment for this course offering — called right before the reset
 * above wipes their marks, so a student's transcript survives across every
 * semester rather than just the current one. */
async function snapshotStudentTranscripts(courseId: string, course: { coordinatorId: string; code: string; title: string; creditHours: number; courseType: string; offeredTermName: string; offeredTermYear: number; batch: { startTerm: string; startYear: number } | null }, criteria: { cloPct: number; ploPct: number; deficiencyPct?: number }) {
  const { computeResultMate } = await import("./resultMate");
  const { getGradingScaleForBatch } = await import("./gradingScaleLookup");
  const result = await computeResultMate(courseId);
  if (result.rows.length === 0) return;

  const [instruments, clos, links, gradingScale] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, include: { mappedPlo: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source: "INSTRUCTOR" } }, include: { lectureRow: true } }),
    course.batch ? getGradingScaleForBatch(course.coordinatorId, course.batch) : Promise.resolve([]),
  ]);
  const instrumentToClo = new Map<string, string>();
  for (const [k, v] of Array.from((await directClos(courseId)).entries())) instrumentToClo.set(k, v);
  for (const link of links) if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);

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
  const gpaByLetter = new Map(gradingScale.map((g) => [g.letter, g.gpaValue]));
  const ofMax = (v: number | undefined, max: number | undefined) => (max ? Math.round((1000 * (v || 0)) / max) / 10 : 0);

  // A non-credit deficiency course (creditHours 0, e.g. Maths-I) is just
  // Pass/Fail against its own pass mark: no letter grade, no GPA points,
  // and (0 credits) it can never move the CGPA.
  const isDeficiency = course.creditHours === 0;
  const deficiencyPct = criteria.deficiencyPct ?? 40;

  await prisma.studentTranscriptRecord.createMany({
    data: result.rows.map((r) => ({
      studentId: r.studentId, coordinatorId: course.coordinatorId,
      courseCode: course.code, courseTitle: course.title, creditHours: course.creditHours, courseType: course.courseType,
      termName: course.offeredTermName, termYear: course.offeredTermYear,
      totalPct: r.totalPct,
      grade: isDeficiency ? (r.totalPct >= deficiencyPct ? "P" : "F") : r.grade,
      gpaPoints: isDeficiency ? null : gpaByLetter.get(r.grade) ?? null,
      // pct is the student's % of what the outcome was worth (every reader of these records treats it as a percentage);
      // the marks themselves are shares of the whole course, so they are divided by the outcome's own weight.
      cloAttainmentJson: JSON.stringify(result.cloCodes.map((code) => ({ code, pct: ofMax(r.byClo[code], cloMaxWeight[code]), passed: (r.byClo[code] || 0) >= (cloMaxWeight[code] || 0) * (criteria.cloPct / 100) }))),
      ploAttainmentJson: JSON.stringify(result.ploLabels.map((label) => ({ label, pct: ofMax(r.byPlo[label], ploMaxWeight[label]), passed: (r.byPlo[label] || 0) >= (ploMaxWeight[label] || 0) * (criteria.ploPct / 100) }))),
    })),
  });
}
