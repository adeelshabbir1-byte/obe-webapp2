import { prisma } from "./db";

/** Groups a set of lecture rows by their topic string, summing lecture count and marks weight. */
function groupByTopic(rows: { topic: string; weightPct: number }[]) {
  const map = new Map<string, { lectures: number; weightPct: number }>();
  for (const r of rows) {
    if (!r.topic) continue;
    const existing = map.get(r.topic) || { lectures: 0, weightPct: 0 };
    existing.lectures += 1;
    existing.weightPct += r.weightPct;
    map.set(r.topic, existing);
  }
  return map;
}

/**
 * Compares the Subject Expert's planned lecture rows against the
 * Instructor's actual ones for one course, grouped by topic — matching the
 * "diff btw Sub Exp and current" sheet structure from the reference Excel.
 */
export async function computeTopicVariance(courseId: string) {
  const [seRows, instructorRows] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" } }),
  ]);

  const seByTopic = groupByTopic(seRows);
  const actualByTopic = groupByTopic(instructorRows);

  const totalSeWeight = Array.from(seByTopic.values()).reduce((s, v) => s + v.weightPct, 0) || 1;
  const totalSeLectures = Array.from(seByTopic.values()).reduce((s, v) => s + v.lectures, 0) || 1;

  const topics = Array.from(seByTopic.entries()).map(([topic, planned]) => {
    const actual = actualByTopic.get(topic) || { lectures: 0, weightPct: 0 };
    return {
      topic,
      plannedLectures: planned.lectures, plannedWeightPct: planned.weightPct,
      plannedLecturePct: Math.round((planned.lectures / totalSeLectures) * 1000) / 10,
      plannedWeightSharePct: Math.round((planned.weightPct / totalSeWeight) * 1000) / 10,
      actualLectures: actual.lectures, actualWeightPct: actual.weightPct,
      covered: actual.lectures > 0,
    };
  });

  const missed = topics.filter((t) => !t.covered);
  const totalMissedWeightPct = missed.reduce((s, t) => s + t.plannedWeightPct, 0);
  const adherencePct = totalSeWeight > 0 ? Math.round(((totalSeWeight - totalMissedWeightPct) / totalSeWeight) * 100) : 100;

  return { topics, missed, totalMissedWeightPct, adherencePct };
}

/**
 * Finds every course record related to this one (same coordinator, matched
 * by masterCourseId or code — i.e. "the same course" across different
 * batches/instructors/semesters), for the cross-instructor comparison.
 */
export async function getCourseFamily(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true, instructor: true } });
  if (!course) return [];

  const where = course.masterCourseId
    ? { coordinatorId: course.coordinatorId, masterCourseId: course.masterCourseId }
    : { coordinatorId: course.coordinatorId, code: course.code };

  const family = await prisma.course.findMany({
    where, include: { batch: true, instructor: true },
    orderBy: [{ offeredTermYear: "desc" }],
  });

  const rows = [];
  for (const c of family) {
    if (!c.instructor) continue; // only meaningful for courses that actually have an instructor delivering them
    const variance = await computeTopicVariance(c.id);
    rows.push({
      courseId: c.id, instructorName: c.instructor.name,
      term: c.offeredTermName ? `${c.offeredTermName} ${c.offeredTermYear}` : "—",
      batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
      adherencePct: variance.adherencePct, topicsMissed: variance.missed.length, totalTopics: variance.topics.length,
    });
  }
  return rows;
}
