// Shared "how far along is this course" logic — used by the SE's own
// course list (app/subjectexpert/courses/page.tsx) and the Institute Head's
// faculty-workload dashboard (app/chairman/faculty-workload/page.tsx), so
// the two views agree on what "done" means for a given step.

export type ProgressStep = { label: string; done: boolean };

const EXAM_RE = /\b(mid[- ]?term|final)\b.*\b(exam|examination|review)\b|\bexam(ination)?\b/i;
const REVIEW_RE = /\b(revision|recap|course review|review session|review of|review and|review &)\b|^\s*review\b/i;
/** Lecture counts for the "mapped to CLOs" step: Midterm/Final exam or review slots and empty rows don't need a CLO. */
export const isTeachingTopic = (topic: string) => !!(topic || "").trim() && !EXAM_RE.test(topic) && !REVIEW_RE.test(topic);

export function teachingLectureCounts(rows: { topic: string; cloId: string | null }[]) {
  const teaching = rows.filter((r) => (r.topic || "").trim() && !EXAM_RE.test(r.topic) && !REVIEW_RE.test(r.topic));
  return { lectureCount: teaching.length, lectureMappedCount: teaching.filter((r) => !!r.cloId).length };
}

/**
 * The Subject Expert's steps. Steps 2 and 4 follow the OMC's minimums (topics per CLO / PLO, marks and items per PLO):
 * once those are met the step is done, even if some lectures have no CLO or are not tested by any assessment.
 * Pass topicShort / assessShort from evaluateCoverage (lib/ploCoverage).
 */
export function buildSeProgress(opts: {
  cloCount: number; lectureCount: number; instrumentCount: number;
  topicShort: string[]; assessShort: string[];
  midtermPaperCount: number; finalPaperCount: number;
  templateStatus: string;
}): ProgressStep[] {
  return [
    { label: "CLOs defined", done: opts.cloCount > 0 },
    { label: opts.topicShort.length ? `Lecture plan meets OMC minimum topics (${opts.topicShort.join("; ")})` : "Lecture plan meets OMC minimum topics per CLO/PLO", done: opts.lectureCount > 0 && opts.topicShort.length === 0 },
    { label: "Quizzes/Assignments/Exams set up", done: opts.instrumentCount > 0 },
    { label: opts.assessShort.length ? `PLOs assessed as OMC requires (${opts.assessShort.join("; ")})` : "PLOs assessed as OMC requires", done: opts.instrumentCount > 0 && opts.assessShort.length === 0 },
    { label: "Midterm & Final paper distribution set", done: opts.midtermPaperCount > 0 && opts.finalPaperCount > 0 },
    { label: "Submitted to OMC", done: opts.templateStatus !== "draft" && opts.templateStatus !== "changes-requested" && opts.templateStatus !== "reopened" },
  ];
}

export function buildInstructorProgress(opts: {
  lectureCount: number; lectureDeliveredCount: number;
  marksEnteredCount: number;
  attendanceRecordCount: number;
  midtermPaperCount: number; finalPaperCount: number;
}): ProgressStep[] {
  return [
    { label: "Lecture delivery started", done: opts.lectureDeliveredCount > 0 },
    { label: "All planned lectures delivered", done: opts.lectureCount > 0 && opts.lectureDeliveredCount === opts.lectureCount },
    { label: "Midterm & Final paper distribution set", done: opts.midtermPaperCount > 0 && opts.finalPaperCount > 0 },
    { label: "Marks entered", done: opts.marksEnteredCount > 0 },
    { label: "Attendance recorded", done: opts.attendanceRecordCount > 0 },
  ];
}

export function progressPct(steps: ProgressStep[]): number {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}
