export const REPORT_VIEWER_NAV = [
  { href: "/omc/reports", label: "Reports" },
  { href: "/omc/total-summary", label: "Total Summary" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
];

export const OMC_ACTION_NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/omc/section-comparison", label: "Section Comparison" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/omc/reports", label: "Reports" },
];

export const INSTRUCTOR_NAV = [
  { href: "/instructor/courses", label: "My Semester Courses" },
  { href: "/omc/reports", label: "Reports" },
];

export const SUBJECT_EXPERT_NAV = [
  { href: "/subjectexpert/courses", label: "My Assigned Courses" },
  { href: "/omc/reports", label: "Reports" },
];

export const COORDINATOR_NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export const CHAIRMAN_NAV = [
  { href: "/chairman/coordinators", label: "Program Coordinators" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" },
  { href: "/chairman/assigners", label: "Course Assigners" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/omc/reports", label: "Reports" },
];

export function navForRole(role: string) {
  switch (role) {
    case "OMC": return OMC_ACTION_NAV;
    case "INSTRUCTOR": return INSTRUCTOR_NAV;
    case "SUBJECT_EXPERT": return SUBJECT_EXPERT_NAV;
    case "PROGRAM_COORDINATOR": return COORDINATOR_NAV;
    case "CHAIRMAN": return CHAIRMAN_NAV;
    default: return REPORT_VIEWER_NAV;
  }
}
