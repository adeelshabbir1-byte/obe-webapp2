// The starting "My work" list for each role — the pages that role uses every day. Each person can pin/unpin
// their own (saved in UserNavPref); "Reset to default" returns to this list.
export const DEFAULT_WORK: Record<string, string[]> = {
  INSTRUCTOR: ["/instructor/courses", "/instructor/timetable", "/deadlines", "/exams", "/my-obe", "/outcome-flow"],
  SUBJECT_EXPERT: ["/subjectexpert/courses", "/deadlines", "/faculty/topic-workspace", "/follow-ups", "/outcome-flow"],
  PROGRAM_COORDINATOR: ["/coordinator/batches", "/coordinator/semester", "/coordinator/courses", "/coordinator/assign-subject-experts", "/coordinator/students", "/outcome-flow", "/deadlines", "/requests"],
  CHAIRMAN: ["/home", "/results-approval", "/leave-approvals", "/risk", "/chairman/people", "/outcome-flow", "/deadlines"],
  OMC: ["/omc/queue", "/omc/instructor-review", "/omc/plo-requests", "/omc/plo-weights", "/outcome-flow", "/chairman/cqi"],
  DEAN: ["/dean/overview", "/dean/approvals", "/results-approval", "/risk", "/leave-approvals", "/outcome-flow"],
  HEAD_OF_DEPARTMENT: ["/hod/department", "/results-approval", "/leave-approvals", "/risk", "/hod/borrow-teacher", "/outcome-flow"],
  COURSE_ASSIGNER: ["/assigner/matrix", "/deadlines", "/requests"],
};

export const ROLE_WORK_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor work", SUBJECT_EXPERT: "SE work", PROGRAM_COORDINATOR: "Program Lead work", CHAIRMAN: "Institute Head work",
  OMC: "OMC work", DEAN: "Dean work", HEAD_OF_DEPARTMENT: "Chairman work", COURSE_ASSIGNER: "Course Assigner work",
};

/** The default list, keeping only pages this role's menu actually has (falls back to the first few menu pages). */
export function defaultWork(role: string, menu: { href: string }[]) {
  const have = new Set(menu.map((l) => l.href));
  const list = (DEFAULT_WORK[role] || []).filter((h) => have.has(h) || h === "/requests");
  return list.length ? list : menu.slice(0, 5).map((l) => l.href);
}
