// Lighter menus. Each role's main menu shows only the pages that role ACTS on (about 10–15, in a few groups). Everything
// else the role may open stays reachable, but out of the way: "More pages" (other work) and "Reports (view only)",
// both collapsed. Duties a person holds (Advisor, Controller of Examinations, QEC, OMC Convener, Counsellor) add their
// own small group. The task analysis behind these lists is in lib/roleMatrix.ts (page /who-does-what).

type Link = { href: string; label: string };
type Section = { title: string; links: Link[] };

export const CORE: Record<string, [string, string[]][]> = {
  CHAIRMAN: [
    ["Today", ["/home", "/approvals", "/head-dashboard", "/deadlines"]],
    ["People & structure", ["/chairman/org-chart", "/chairman/people", "/leave-approvals"]],
    ["Academics", ["/results-approval", "/academic-calendar", "/academic-rules"]],
    ["Accreditation", ["/accreditation-overview", "/accreditation/readiness", "/quality-office"]],
    ["Institute", ["/chairman/institute-settings", "/data-import", "/controller", "/chairman/backups", "/chairman/campuses", "/billing"]],
  ],
  DEAN: [
    ["Today", ["/dean/overview", "/approvals", "/head-dashboard", "/deadlines"]],
    ["Faculty & departments", ["/dean/course-codes", "/dean/approvals", "/leave-approvals", "/teacher-performance", "/dean/curricula"]],
    ["Academics", ["/results-approval", "/academic-calendar", "/admission-criteria"]],
    ["Accreditation", ["/accreditation-overview", "/accreditation/readiness", "/quality-office"]],
  ],
  HEAD_OF_DEPARTMENT: [
    ["Today", ["/hod/department", "/approvals", "/head-dashboard", "/deadlines"]],
    ["Faculty", ["/leave-approvals", "/hod/borrow-teacher", "/recruitment", "/teacher-performance", "/fdp"]],
    ["Academics", ["/results-approval", "/meeting-planner"]],
    ["Accreditation", ["/accreditation/readiness", "/accreditation/tasks"]],
  ],
  PROGRAM_COORDINATOR: [
    ["Today", ["/approvals", "/deadlines", "/requests"]],
    ["Semester", ["/coordinator/semester", "/coordinator/timetable", "/coordinator/calendar"]],
    ["Program", ["/coordinator/batches", "/curricula", "/coordinator/curriculum-sync", "/coordinator/course-codes", "/coordinator/courses", "/coordinator/assign-subject-experts", "/coordinator/plos"]],
    ["Students", ["/coordinator/students", "/coordinator/student-transcript", "/data-import"]],
    ["Accreditation", ["/accreditation/tasks", "/accreditation/readiness", "/coordinator/evidence"]],
  ],
  DEPARTMENT_COORDINATOR: [
    ["Today", ["/dept-coordinator/home", "/approvals", "/deadlines"]],
    ["Semester", ["/coordinator/semester", "/coordinator/timetable", "/coordinator/calendar"]],
    ["Students", ["/coordinator/students", "/coordinator/bulk-student-upload", "/data-import"]],
    ["Accreditation", ["/accreditation/tasks", "/accreditation/readiness"]],
  ],
  OMC: [
    ["Today", ["/omc/queue", "/approvals", "/deadlines"]],
    ["Review", ["/paper-vetting", "/moderation", "/omc/instructor-review", "/omc/weight-exceptions", "/omc/template-changes"]],
    ["Outcomes & rules", ["/omc/plo-matrix", "/omc/plo-requests", "/omc/assessment-rules", "/chairman/cqi"]],
  ],
  INSTRUCTOR: [
    ["Today", ["/instructor/courses", "/instructor/timetable", "/deadlines", "/approvals"]],
    ["Teaching", ["/instructor/labs", "/exams", "/question-bank", "/fyp", "/my-leave"]],
    ["Me", ["/faculty/profile", "/faculty/my-availability", "/faculty/course-preferences", "/fdp"]],
  ],
  SUBJECT_EXPERT: [
    ["Today", ["/subjectexpert/courses", "/deadlines", "/approvals"]],
    ["Design", ["/faculty/topic-workspace", "/follow-ups", "/question-bank"]],
    ["Me", ["/faculty/profile", "/fdp"]],
  ],
  LAB_ENGINEER: [
    ["Today", ["/lab-engineer/labs", "/deadlines", "/approvals"]],
    ["Labs", ["/lab-file", "/assets", "/exams"]],
    ["Me", ["/faculty/profile", "/faculty/my-availability", "/fdp"]],
  ],
  LAB_MANAGER: [
    ["Today", ["/deadlines", "/approvals"]],
    ["Labs", ["/lab-inventory", "/assets", "/inventory", "/purchasing", "/lab-file"]],
  ],
  LIBRARIAN: [
    ["Today", ["/library-desk", "/deadlines", "/approvals"]],
    ["Library", ["/library-inventory", "/library/requisitions", "/purchasing"]],
  ],
  FINANCE_OFFICER: [
    ["Today", ["/deadlines", "/approvals"]],
    ["Finance", ["/chairman/finance", "/fees", "/fee-refunds", "/accounts", "/hr", "/fdp-funding", "/benefits"]],
  ],
  FACILITIES_MANAGER: [
    ["Today", ["/deadlines", "/approvals"]],
    ["Facilities", ["/facilities", "/facility-booking", "/assets", "/inventory", "/faculty-meals"]],
  ],
  STUDENT_AFFAIRS: [
    ["Today", ["/deadlines", "/approvals"]],
    ["Students", ["/admissions", "/counselling", "/student-activities", "/societies/elections", "/placements", "/complaints", "/accommodations"]],
    ["Calendar", ["/academic-calendar", "/admission-criteria"]],
  ],
  COURSE_ASSIGNER: [
    ["Today", ["/assigner/matrix", "/deadlines", "/requests"]],
  ],
};

/** Pages that only show information (reports, analytics, directories, maps, own records). */
const VIEW = new Set([
  "/omc/reports", "/yearly-summary", "/benchmarking", "/faculty-report", "/plo-progress", "/outcome-flow", "/grade-distribution", "/student-movement",
  "/peo-attainment", "/accreditation/outcomes-report", "/indirect-assessment", "/coordinator/load-report", "/coordinator/semester-health",
  "/coordinator/batch-comparison", "/coordinator/elective-instructor-report", "/coordinator/feedforward-digest", "/coordinator/attendance",
  "/coordinator/program-semester-map", "/coordinator/semester-section-map", "/coordinator/prerequisite-map", "/coordinator/curriculum-readiness-matrix",
  "/topic-overlaps", "/topic-prerequisites", "/omc/total-summary", "/omc/adherence-report", "/omc/section-comparison", "/omc/prerequisite-correlation",
  "/chairman/audit-log", "/inactivity", "/prediction", "/early-warning", "/teacher-performance", "/public-library", "/national-bank", "/ga-council-map",
  "/faculty-sufficiency", "/accreditation-overview", "/coordinator/accreditation-status", "/recognition", "/learn", "/learn/certification", "/my-feedback",
  "/my-payslips", "/benefits", "/signed-documents", "/internationalisation", "/qec-proformas", "/risk", "/head-dashboard", "/coordinator/hec-comparison",
  "/coordinator/assignment-history", "/coordinator/report-bundles", "/my-obe", "/instructor/peers", "/coordinator/deficiency-status", "/plan-insights",
  "/evaluations", "/exit-surveys", "/faculty-survey", "/aol", "/complex-problems", "/policy-history", "/coordinator/labs-overview", "/library-inventory", "/lab-inventory",
  "/courses-in-degree", "/who-does-what", "/process-map", "/ga-coverage", "/where-courses-used", "/program-spec",
]);

/** Split a role's flat menu into the main menu (core + duties), other work pages, and view-only reports. Null = role not curated. */
export function splitMenu(role: string, links: Link[], dutyHrefs: string[], group: (l: Link[]) => Section[]) {
  const core = CORE[role];
  if (!core) return null;
  const byHref = new Map(links.map((l) => [l.href, l]));
  const used = new Set<string>();
  const main: Section[] = [];
  for (const [title, hrefs] of core) {
    const ls = hrefs.map((h) => byHref.get(h)).filter((l): l is Link => !!l && !used.has(l.href));
    ls.forEach((l) => used.add(l.href));
    if (ls.length) main.push({ title, links: ls });
  }
  const duty = dutyHrefs.map((h) => byHref.get(h)).filter((l): l is Link => !!l && !used.has(l.href));
  duty.forEach((l) => used.add(l.href));
  if (duty.length) main.push({ title: "My duties", links: duty });
  const rest = links.filter((l) => !used.has(l.href));
  return { main, more: group(rest.filter((l) => !VIEW.has(l.href))), view: group(rest.filter((l) => VIEW.has(l.href))), mainCount: used.size, total: links.length };
}
