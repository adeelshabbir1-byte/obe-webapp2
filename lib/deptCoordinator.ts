// The department-wide Program Coordinator is the Program Lead's assistant. While working on one program of the
// department they may use ONLY these parts of the app - the things that involve people, calendars and the timetable.
// Everything else (course setup, curriculum, PLOs, Subject Experts, grading, program documents) stays with the Program Lead:
// those pages are not shown to the coordinator. (The semester and calendar pages need the course/batch services behind them to offer
// a semester and set exam dates, so those services are reachable, but only through those pages.)
export const DEPT_COORDINATOR_PAGES = [
  "/coordinator/faculty", "/coordinator/students", "/coordinator/bulk-student-upload", "/coordinator/semester", "/coordinator/calendar",
  "/coordinator/timetable", "/coordinator/load-report", "/coordinator/out-of-batch-requests", "/coordinator/repeat-offering",
  "/coordinator/semester-health", "/coordinator/historical-grades-upload", "/coordinator/student-transcript", "/coordinator/faculty-requests",
];
export const DEPT_COORDINATOR_APIS = [
  "/api/coordinator/faculty", "/api/coordinator/faculty-preferred-days", "/api/coordinator/faculty-unavailability", "/api/coordinator/students",
  "/api/coordinator/current-term", "/api/coordinator/holidays", "/api/coordinator/semester-dates", "/api/coordinator/schedule-sections",
  "/api/coordinator/timetable", "/api/coordinator/rooms", "/api/coordinator/class-day-modes", "/api/coordinator/load-report",
  "/api/coordinator/out-of-batch-requests", "/api/coordinator/historical-grades", "/api/coordinator/new-intake", "/api/coordinator/batch-schedule-config",
  "/api/coordinator/offer-semester", "/api/coordinator/courses", "/api/coordinator/batches", "/api/coordinator/degree-programs",
  "/api/loans",
];

export function isDeptCoordinatorPath(path: string): boolean {
  return [...DEPT_COORDINATOR_PAGES, ...DEPT_COORDINATOR_APIS].some((p) => path === p || path.startsWith(p + "/"));
}
