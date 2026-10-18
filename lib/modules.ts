// The parts of OBEHUB an institute can buy separately. The Super User switches each one on or off per institute
// (Platform › Modules). Core OBE — programs, courses, CLOs/PLOs, lecture plans, marks, results, attainment,
// transcripts, people and settings — is always on and is not listed here.
//
// Each module owns the page and API paths below. A locked module's pages show a "not in your subscription" notice,
// its API calls are refused, and its links disappear from the menu. Pure data: safe to import on the client.

export type ModuleKey =
  | "accreditation" | "quality" | "surveys" | "exams" | "labs" | "quizzes" | "paperVetting" | "fyp" | "timetable"
  | "planning" | "nationalBank" | "remediation" | "portfolio" | "studentServices" | "messaging" | "training"
  | "complexProblems" | "admissions" | "finance" | "inventory";

export type ModuleDef = { key: ModuleKey; label: string; group: string; about: string; paths: RegExp[] };

const p = (re: string) => new RegExp(re);

export const MODULES: ModuleDef[] = [
  // Accreditation and quality
  { key: "accreditation", label: "Accreditation & SAR", group: "Accreditation", about: "Readiness by council criteria, tasks and evidence, visits, one-click SAR, outcomes reports", paths: [p("^/(api/)?accreditation(/|-overview|$)"), p("^/(api/)?evidence-files(/|$)"), p("^/(api/)?coordinator/(sar|evidence|accreditation-status|hec-comparison)(/|$)")] },
  { key: "quality", label: "Quality & QEC tools", group: "Accreditation", about: "PEO attainment, faculty survey, HEC policy check, grade distribution, NBEAC AoL, QEC proformas, IPE, internationalisation", paths: [p("^/(peo-attainment|faculty-survey|policy-check|grade-distribution|aol|qec-proformas|ipe|internationalisation)(/|$)"), p("^/api/quality(/|$)")] },
  { key: "surveys", label: "Surveys & evaluations", group: "Accreditation", about: "Course and teacher evaluations, exit, alumni, employer and internship surveys, direct + indirect PLOs", paths: [p("^/(api/)?(evaluations|exit-surveys|exit|survey|indirect-assessment)(/|$)"), p("^/(api/)?coordinator/(surveys|stakeholders)(/|$)"), p("^/(api/)?student/course-survey(/|$)")] },
  { key: "complexProblems", label: "Complex problems & benchmarking", group: "Accreditation", about: "Complex problems (WP/EA), knowledge profile, benchmarking, topic overlaps", paths: [p("^/(api/)?(complex-problems|benchmarking|topic-overlaps)(/|$)")] },
  // Teaching
  { key: "labs", label: "Labs", group: "Teaching", about: "Lab plan linked to lectures, manuals and solutions with approval, lab marks, lab inventory and lab file", paths: [p("^/(api/)?(lab|lab-engineer|lab-file|lab-inventory)(/|$)"), p("^/(api/)?instructor/labs(/|$)")] },
  { key: "quizzes", label: "Online quizzes & submissions", group: "Teaching", about: "MCQ question banks with auto-grading, assignment hand-in", paths: [p("^/(api/)?mcq(/|$)"), p("^/(api/)?submissions(/|$)"), p("^/instructor/courses/[^/]+/(quizzes|submissions)(/|$)"), p("^/(api/)?student/(quizzes|quiz|submissions)(/|$)")] },
  { key: "paperVetting", label: "Paper vetting", group: "Teaching", about: "System and AI checks of exam papers against CLOs, Program Lead approval", paths: [p("^/(api/)?paper-vetting(/|$)"), p("^/instructor/courses/[^/]+/paper-vetting(/|$)")] },
  { key: "fyp", label: "Final year projects", group: "Teaching", about: "Project allotment, Gantt charts, evaluations, open house", paths: [p("^/(api/)?fyp(/|$)"), p("^/(api/)?student/fyp(/|$)")] },
  { key: "remediation", label: "Remediation", group: "Teaching", about: "Weak-topic flags by teachers and advisors, remediation plans and workshops", paths: [p("^/(api/)?(remediation|remediation-flags)(/|$)")] },
  { key: "portfolio", label: "Student portfolios & work samples", group: "Teaching", about: "Work samples per course, student e-portfolio, portfolio review", paths: [p("^/(api/)?portfolio-review(/|$)"), p("^/(api/)?student/portfolio(/|$)"), p("^/instructor/courses/[^/]+/samples(/|$)")] },
  { key: "training", label: "OBE training & badges", group: "Teaching", about: "Training, certification exam before curriculum work, badges and recognition", paths: [p("^/(api/)?learn(/|$)"), p("^/(api/)?chairman/training(/|$)"), p("^/(api/)?recognition(/|$)")] },
  { key: "nationalBank", label: "National Curriculum Bank", group: "Teaching", about: "Share and import curricula between universities, with credit", paths: [p("^/(api/)?(national-bank|public-library|public-courses)(/|$)")] },
  // Operations
  { key: "exams", label: "Exams", group: "Operations", about: "Date sheets, invigilation duty pool, preferences and swaps", paths: [p("^/(api/)?exams(/|$)"), p("^/(api/)?student/exams(/|$)")] },
  { key: "timetable", label: "Timetable", group: "Operations", about: "Timetable generation and the day × time grids", paths: [p("^/(api/)?coordinator/timetable(/|$)"), p("^/(api/)?student/timetable(/|$)")] },
  { key: "planning", label: "Semester planning", group: "Operations", about: "Semester plan with deadlines by role, university planner, reminders", paths: [p("^/(api/)?(semester-plan|deadlines|plans)(/|$)")] },
  { key: "studentServices", label: "Student services", group: "Operations", about: "Internships and placements, complaints, societies and activities, CVs", paths: [p("^/(api/)?(placements|complaints|student-activities|cv|cv-review|cv-book)(/|$)"), p("^/(api/)?student/(placements|complaints|activities|cv)(/|$)")] },
  { key: "messaging", label: "SMS & WhatsApp", group: "Operations", about: "Alerts to staff, students and guardians by SMS and WhatsApp", paths: [p("^/(api/)?chairman/messaging(/|$)"), p("^/api/messaging(/|$)"), p("^/(api/)?student/alerts(/|$)")] },
  // ERP
  { key: "admissions", label: "Admissions CRM", group: "University ERP", about: "Inquiries, applications, admission criteria", paths: [p("^/(api/)?(admissions|admission-criteria)(/|$)")] },
  { key: "finance", label: "Fees, HR & accounts", group: "University ERP", about: "Student fees, payroll and payslips, accounts, budgets, appraisals", paths: [p("^/(api/)?(fees|hr|accounts|my-payslips|appraisals)(/|$)"), p("^/(api/)?chairman/finance(/|$)"), p("^/(api/)?student/fees(/|$)")] },
  { key: "inventory", label: "Inventory & purchasing", group: "University ERP", about: "Store, purchasing, library inventory, facilities", paths: [p("^/(api/)?(inventory|purchasing|library-inventory|facilities)(/|$)")] },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);
export const moduleOf = (key: string) => MODULES.find((m) => m.key === key) || null;

/** The module that owns this path, if any (core paths return null). */
export function moduleForPath(path: string): ModuleDef | null {
  const clean = (path || "").split("?")[0];
  return MODULES.find((m) => m.paths.some((re) => re.test(clean))) || null;
}

/** Ready-made packages the Super User can apply in one click. */
export const PACKAGES: { key: string; label: string; modules: ModuleKey[] }[] = [
  { key: "starter", label: "Starter (core OBE only)", modules: [] },
  { key: "accreditation", label: "Accreditation", modules: ["accreditation", "quality", "surveys", "complexProblems", "portfolio", "training"] },
  // One council's full requirement, for an institute accredited by that council only. The accreditation pages follow
  // whichever council each program is bound to, so the same modules serve every council.
  { key: "nbeac", label: "NBEAC (business schools)", modules: ["accreditation", "quality", "surveys", "studentServices", "portfolio", "training"] },
  { key: "nceac", label: "NCEAC (computing)", modules: ["accreditation", "quality", "surveys", "complexProblems", "labs", "fyp", "portfolio", "studentServices", "training"] },
  { key: "pec", label: "PEC (engineering)", modules: ["accreditation", "quality", "surveys", "complexProblems", "labs", "fyp", "portfolio", "studentServices", "training"] },
  { key: "hec", label: "HEC QEC / IPE", modules: ["accreditation", "quality", "surveys", "training"] },
  { key: "academic", label: "Academic", modules: ["accreditation", "quality", "surveys", "complexProblems", "portfolio", "training", "labs", "quizzes", "paperVetting", "fyp", "remediation", "nationalBank", "exams", "timetable", "planning", "studentServices"] },
  { key: "complete", label: "Complete (everything)", modules: [...MODULE_KEYS] },
];
