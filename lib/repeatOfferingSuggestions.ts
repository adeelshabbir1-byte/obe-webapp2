import { prisma } from "./db";

// "Which course should I offer as an extra/repeat section this term?" —
// ranks course codes by how many students, across every batch this
// coordinator runs, are currently stuck without a way to take a course
// they need for their own degree plan (it's due or already overdue for
// them, they haven't passed it, they aren't already enrolled in it, and
// — critically — NO section of that course code is currently offered
// anywhere, so there's genuinely nowhere for them to register right now).
// This deliberately reuses the same "planned vs native semester, taken
// codes, currently enrolled" logic as the student/advisor Degree Plan
// APIs, just run across every student at once instead of one at a time.

export type OfferingSuggestionStudent = { id: string; name: string; rollNumber: string; batchLabel: string; overdue: boolean };
export type OfferingSuggestion = {
  code: string;
  title: string;
  creditHours: number;
  studentCount: number;
  overdueCount: number;
  students: OfferingSuggestionStudent[];
  suggestedCourseId: string;
  suggestedBatchLabel: string;
};

export async function computeRepeatOfferingSuggestions(coordinatorId: string): Promise<OfferingSuggestion[]> {
  const [courses, students] = await Promise.all([
    prisma.course.findMany({ where: { coordinatorId }, include: { batch: true } }),
    prisma.student.findMany({
      where: { batch: { coordinatorId } },
      include: {
        batch: true,
        transcriptRecords: { select: { courseCode: true } },
        degreePlanEntries: { select: { courseId: true, plannedSemesterNumber: true } },
        enrollments: { select: { courseId: true } },
      },
    }),
  ]);

  const coursesByBatch = new Map<string, typeof courses>();
  for (const c of courses) {
    if (!c.batchId) continue;
    if (!coursesByBatch.has(c.batchId)) coursesByBatch.set(c.batchId, []);
    coursesByBatch.get(c.batchId)!.push(c);
  }
  // Any code with at least one currently-offered section anywhere means
  // there's already somewhere for these students to register — that's a
  // normal enrollment gap, not a "nothing to offer" gap, so it's not a
  // suggestion here.
  const offeredCodes = new Set(courses.filter((c) => c.isOffered).map((c) => c.code));

  type Bucket = { title: string; creditHours: number; students: OfferingSuggestionStudent[]; overdueCount: number; rows: typeof courses };
  const byCode = new Map<string, Bucket>();

  for (const s of students) {
    const takenCodes = new Set(s.transcriptRecords.map((t) => t.courseCode));
    const enrolledIds = new Set(s.enrollments.map((e) => e.courseId));
    const plannedByCourseId = new Map(s.degreePlanEntries.map((e) => [e.courseId, e.plannedSemesterNumber]));
    const batchCourses = coursesByBatch.get(s.batchId) || [];

    for (const c of batchCourses) {
      if (takenCodes.has(c.code)) continue;
      if (enrolledIds.has(c.id)) continue;
      if (offeredCodes.has(c.code)) continue;
      const planned = plannedByCourseId.get(c.id) ?? c.semesterNumber ?? 1;
      if (planned > s.currentSemesterNumber) continue; // not due yet — normal future course, not a gap
      const overdue = planned < s.currentSemesterNumber;

      if (!byCode.has(c.code)) byCode.set(c.code, { title: c.title, creditHours: c.creditHours, students: [], overdueCount: 0, rows: [] });
      const bucket = byCode.get(c.code)!;
      bucket.students.push({
        id: s.id, name: s.name, rollNumber: s.rollNumber,
        batchLabel: s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : "—",
        overdue,
      });
      if (overdue) bucket.overdueCount++;
      bucket.rows.push(c);
    }
  }

  const suggestions: OfferingSuggestion[] = [];
  for (const [code, bucket] of byCode) {
    if (bucket.students.length === 0) continue;
    // Offer the most recent batch's own copy of this course — the row a
    // coordinator would naturally reach for on the Repeat/Summer page.
    const row = [...bucket.rows].sort((a, b) => (b.batch?.startYear ?? 0) - (a.batch?.startYear ?? 0))[0];
    suggestions.push({
      code,
      title: bucket.title,
      creditHours: bucket.creditHours,
      studentCount: bucket.students.length,
      overdueCount: bucket.overdueCount,
      students: bucket.students.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1)),
      suggestedCourseId: row.id,
      suggestedBatchLabel: row.batch ? `${row.batch.degreeProgram} — ${row.batch.batchName}` : "—",
    });
  }

  suggestions.sort((a, b) => b.studentCount - a.studentCount || b.overdueCount - a.overdueCount || a.code.localeCompare(b.code));
  return suggestions.slice(0, 15);
}
