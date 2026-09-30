// Shared "how far along is this course" logic — used by the SE's own
// course list (app/subjectexpert/courses/page.tsx) and the Chairman's
// faculty-workload dashboard (app/chairman/faculty-workload/page.tsx), so
// the two views agree on what "done" means for a given step.

export type ProgressStep = { label: string; done: boolean };

export function buildSeProgress(opts: {
  cloCount: number;
  lectureCount: number; lectureMappedCount: number;
  instrumentsWithNoLink: number; instrumentCount: number;
  midtermPaperCount: number; finalPaperCount: number;
  templateStatus: string;
}): ProgressStep[] {
  return [
    { label: "CLOs defined", done: opts.cloCount > 0 },
    { label: "Lecture plan set & mapped to CLOs", done: opts.lectureCount > 0 && opts.lectureMappedCount === opts.lectureCount },
    { label: "Quizzes/Assignments/Exams set up", done: opts.instrumentCount > 0 },
    { label: "Lectures linked to quizzes/exams", done: opts.instrumentCount > 0 && opts.instrumentsWithNoLink === 0 },
    { label: "Midterm & Final paper distribution set", done: opts.midtermPaperCount > 0 && opts.finalPaperCount > 0 },
    { label: "Submitted to OMC", done: opts.templateStatus !== "draft" && opts.templateStatus !== "changes-requested" },
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
