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
