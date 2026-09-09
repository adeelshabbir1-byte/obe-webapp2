import { prisma } from "./db";

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
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.offeredTermName || !course.offeredTermYear) return;
  if (course.offeredTermName === newTermName && course.offeredTermYear === newTermYear) return;

  const enrollmentCount = await prisma.studentEnrollment.count({ where: { courseId } });
  if (enrollmentCount === 0) return; // nothing to snapshot or reset

  const { computeCloPloPassRates } = await import("./resultMate");
  const stats = await computeCloPloPassRates(courseId);

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

  // Clear marks and enrollment so the new term's students start fresh —
  // otherwise auto-enrollment would add new students on top of the old
  // ones, mixing two semesters' marks together in one Result Mate view.
  await prisma.studentMark.deleteMany({ where: { courseId } });
  await prisma.studentEnrollment.deleteMany({ where: { courseId } });
}
