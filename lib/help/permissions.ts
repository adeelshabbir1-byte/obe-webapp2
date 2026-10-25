import type { HelpCategory } from "./types";

// "Who can do what" — the permission matrix shown on /help/permissions and quoted by the FAQ.
// Each entry names the code that enforces it; tests/helpPermissions.test.ts reads those files and fails when a check
// listed here is no longer in the code, so the matrix can't silently drift from what the app actually allows.

export type Capability = {
  key: string;
  category: HelpCategory;
  task: string;
  /** Who may do it: staff role values, or one of the PSEUDO roles below. */
  roles: string[];
  /** Limits on the people above, in plain words. */
  scope?: string;
  where?: { href: string; label: string };
  enforcedIn: { file: string; contains: string[] }[];
  article?: string;
};

export const PSEUDO_ROLES: Record<string, string> = {
  SELF: "Everyone (own account)",
  FYP_HEAD: "FYP Head / Committee",
  COURSE_SE: "Subject Expert of the course",
  STUDENT: "Student",
  TASK_ASSIGNEE: "Person given an accreditation task",
};

export const CAPABILITIES: Capability[] = [
  // Account & sign-in
  { key: "reset-own", category: "account", task: "Reset your own forgotten password by email", roles: ["SELF"], scope: "Staff with an email on their account, when the platform's email is set up.",
    where: { href: "/forgot-password", label: "Forgot password" }, article: "forgot-password",
    enforcedIn: [{ file: "app/api/auth/forgot-password/route.ts", contains: ["RESEND_API_KEY", "isActive"] }, { file: "app/api/auth/reset-password/route.ts", contains: ["usedAt", "expiresAt"] }] },
  { key: "reset-head", category: "account", task: "Reset an Institute Head's password", roles: ["SUPER_USER"], scope: "Also the platform team members given onboarding or support.", where: { href: "/admin/users", label: "Users" }, article: "who-resets-passwords",
    enforcedIn: [{ file: "app/api/admin/users/[chairmanId]/reset-password/route.ts", contains: ['adminCan(user, ["ONBOARDING", "SUPPORT"])', 'head.role !== "CHAIRMAN"'] }] },
  { key: "reset-staff", category: "account", task: "Reset anyone's password or turn off their two-step sign-in", roles: ["CHAIRMAN"], scope: "People in their own institute, not themselves.",
    where: { href: "/chairman/people", label: "People & Roles" }, article: "reset-someone-password",
    enforcedIn: [{ file: "app/api/chairman/people/reset-password/route.ts", contains: ['user.role !== "CHAIRMAN"', "institutePeople"] }] },
  { key: "reset-teacher", category: "account", task: "Reset a teacher's password", roles: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"], scope: "Teachers they onboarded; the Program Coordinator only while working on that program.",
    where: { href: "/coordinator/faculty", label: "Teacher Onboarding" }, article: "who-resets-passwords",
    enforcedIn: [{ file: "app/api/coordinator/faculty/[userId]/reset-password/route.ts", contains: ['user.role !== "PROGRAM_COORDINATOR"', "faculty.managedById !== user.id"] }, { file: "lib/deptCoordinator.ts", contains: ['"/api/coordinator/faculty"'] }] },
  { key: "reset-student", category: "account", task: "Reset a student's login to their roll number", roles: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"], scope: "Students of their own batches.",
    where: { href: "/coordinator/students", label: "Student Directory" }, article: "student-forgot-password",
    enforcedIn: [{ file: "app/api/coordinator/students/[studentId]/reset-password/route.ts", contains: ['user.role !== "PROGRAM_COORDINATOR"', "student.batch.coordinatorId !== user.id"] }, { file: "lib/deptCoordinator.ts", contains: ['"/api/coordinator/students"'] }] },
  // People & roles
  { key: "approve-institute", category: "people", task: "Approve a new institute and its Institute Head", roles: ["SUPER_USER"], scope: "Also the platform team members given onboarding.", where: { href: "/admin/account-requests", label: "Account requests" }, article: "request-institute-account",
    enforcedIn: [{ file: "app/api/admin/account-requests/[requestId]/approve/route.ts", contains: ['adminCan(user, "ONBOARDING")'] }] },
  { key: "add-dean", category: "people", task: "Add a Dean", roles: ["CHAIRMAN"], where: { href: "/chairman/faculties", label: "Faculties & Deans" }, article: "add-leadership",
    enforcedIn: [{ file: "app/api/chairman/deans/route.ts", contains: ['user.role !== "CHAIRMAN"', 'role: "DEAN"'] }] },
  { key: "add-hod", category: "people", task: "Add a department Chairman or Program Coordinator", roles: ["CHAIRMAN"], scope: "One Program Coordinator per department.", where: { href: "/chairman/departments", label: "Departments & Programs" }, article: "add-leadership",
    enforcedIn: [{ file: "app/api/chairman/heads/route.ts", contains: ['user.role !== "CHAIRMAN"', '"DEPARTMENT_COORDINATOR"', '"HEAD_OF_DEPARTMENT"'] }] },
  { key: "add-lead", category: "people", task: "Add a Program Lead", roles: ["CHAIRMAN", "HEAD_OF_DEPARTMENT"], scope: "A Chairman only for their own department.", where: { href: "/chairman/coordinators", label: "Program Leads" }, article: "add-program-lead",
    enforcedIn: [{ file: "app/api/leads/route.ts", contains: ['user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT"', 'role: "PROGRAM_COORDIN'] }] },
  { key: "add-omc", category: "people", task: "Add OMC members", roles: ["CHAIRMAN"], where: { href: "/chairman/omc", label: "OMC Members" }, article: "add-omc-member",
    enforcedIn: [{ file: "app/api/chairman/omc/route.ts", contains: ['user.role !== "CHAIRMAN"'] }] },
  { key: "add-assigner", category: "people", task: "Add a Course Assigner", roles: ["CHAIRMAN"], where: { href: "/chairman/assigners", label: "Course Assigners" }, article: "course-assigner-role",
    enforcedIn: [{ file: "app/api/chairman/assigners/route.ts", contains: ['user.role !== "CHAIRMAN"', 'role: "COURSE_ASSIGNER"'] }] },
  { key: "add-staff", category: "people", task: "Add the Lab Manager, Librarian, Finance Officer, Student Affairs or Facilities Manager", roles: ["CHAIRMAN"], where: { href: "/chairman/staff", label: "Staff logins" }, article: "add-support-staff",
    enforcedIn: [{ file: "app/api/chairman/staff/route.ts", contains: ['user.role !== "CHAIRMAN"', '"LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER"'] }] },
  { key: "edit-people", category: "people", task: "Change anyone's roles, details or switch off their login", roles: ["CHAIRMAN"], where: { href: "/chairman/people", label: "People & Roles" }, article: "edit-person-roles",
    enforcedIn: [{ file: "app/api/chairman/people/route.ts", contains: ['user.role !== "CHAIRMAN"'] }] },
  { key: "add-teacher", category: "people", task: "Add Subject Experts, Course Instructors, Lab Engineers and Lab Managers", roles: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"], scope: "The Program Coordinator only while working on a program.",
    where: { href: "/coordinator/faculty", label: "Teacher Onboarding" }, article: "add-faculty",
    enforcedIn: [{ file: "app/api/coordinator/faculty/route.ts", contains: ['user.role !== "PROGRAM_COORDINATOR"', '["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER"]'] }] },
  { key: "import-students", category: "people", task: "Upload students and activate their logins", roles: ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"], where: { href: "/coordinator/bulk-student-upload", label: "Student Directory Upload" }, article: "add-students",
    enforcedIn: [{ file: "app/api/coordinator/students/import-multi-batch/route.ts", contains: ['user.role !== "PROGRAM_COORDINATOR"'] }, { file: "app/api/coordinator/students/activate-logins/route.ts", contains: ['user.role !== "PROGRAM_COORDINATOR"'] }] },
  // Courses, weightage, registration
  { key: "prereq-links", category: "curriculum", task: "Link prerequisite topics and grade them Strong, Mild or Weak", roles: ["COURSE_SE", "PROGRAM_COORDINATOR", "OMC"], where: { href: "/topic-prerequisites", label: "Prerequisite Topics" }, article: "prerequisite-topics",
    enforcedIn: [{ file: "app/api/topic-prerequisites/route.ts", contains: ["Only the Subject Expert of one of these courses, the Program Lead or the OMC"] }] },
  { key: "weight-policy", category: "weights", task: "Set the assessment weight policy", roles: ["OMC"], where: { href: "/omc/weight-policy", label: "Weight Policy" }, article: "weight-policy",
    enforcedIn: [{ file: "app/api/omc/weight-policy/route.ts", contains: ['user.role !== "OMC"'] }] },
  { key: "weight-exceptions", category: "weights", task: "Approve or reject weights outside the policy", roles: ["OMC"], where: { href: "/omc/weight-exceptions", label: "Weight Exceptions" }, article: "weight-exception",
    enforcedIn: [{ file: "app/api/omc/weight-exceptions/[requestId]/route.ts", contains: ['user.role !== "OMC"'] }] },
  { key: "registration-rules", category: "registration", task: "Set the registration rules", roles: ["OMC", "CHAIRMAN"], where: { href: "/registration-rules", label: "Registration Rules" }, article: "registration-rules",
    enforcedIn: [{ file: "app/api/registration-rules/route.ts", contains: ['["OMC", "CHAIRMAN"].includes(user.role)'] }] },
  { key: "exemptions", category: "registration", task: "Exempt a student from a registration rule (prerequisite override)", roles: ["CHAIRMAN"], where: { href: "/registration-rules", label: "Registration Rules & Exemptions" }, article: "grant-exemption",
    enforcedIn: [{ file: "app/api/registration-rules/exemptions/route.ts", contains: ["Only the Institute Head can grant exemptions."] }] },
  // Exams, results, leave
  { key: "exams", category: "exams", task: "Build exam date sheets, rooms and invigilation", roles: ["CHAIRMAN"], where: { href: "/exams", label: "Exams" }, article: "exam-date-sheets",
    enforcedIn: [{ file: "lib/exams.ts", contains: ['EXAM_MANAGERS = ["CHAIRMAN"]'] }] },
  { key: "results", category: "exams", task: "Approve course results and decide grade changes", roles: ["CHAIRMAN", "HEAD_OF_DEPARTMENT"], scope: "Never for a course they teach; a Chairman only for their own department.",
    where: { href: "/results-approval", label: "Result Approval" }, article: "submit-approve-results",
    enforcedIn: [{ file: "lib/resultApproval.ts", contains: ['APPROVER_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"]', "nobody approves their own result"] }] },
  { key: "leave", category: "teaching", task: "Approve short leave and pick substitutes", roles: ["CHAIRMAN", "HEAD_OF_DEPARTMENT"], where: { href: "/leave-approvals", label: "Leave & Substitutes" }, article: "short-leave",
    enforcedIn: [{ file: "lib/shortLeave.ts", contains: ['if (user.role === "CHAIRMAN") return l.chairmanId === user.id;', '"HEAD_OF_DEPARTMENT"'] }] },
  // FYP
  { key: "fyp-head", category: "fyp", task: "Name the FYP Head and Committee", roles: ["HEAD_OF_DEPARTMENT", "CHAIRMAN"], where: { href: "/fyp/manage", label: "Final Year Projects" }, article: "fyp-who-does-what",
    enforcedIn: [{ file: "app/api/fyp/admin/route.ts", contains: ["Only the department's Chairman (or the Institute Head) names the FYP Head."] }] },
  { key: "fyp-panels", category: "fyp", task: "Approve proposals, form evaluation panels and consolidate marks", roles: ["FYP_HEAD"], where: { href: "/fyp/manage", label: "Final Year Projects" }, article: "fyp-who-does-what",
    enforcedIn: [{ file: "app/api/fyp/admin/route.ts", contains: ['case "assignPanel"', 'case "autoAssign"', "Only the FYP Head or Committee"] }] },
  { key: "fyp-signoff", category: "fyp", task: "Sign off FYP results", roles: ["HEAD_OF_DEPARTMENT"], scope: "The department's own Chairman.", where: { href: "/fyp/manage", label: "Final Year Projects" }, article: "fyp-who-does-what",
    enforcedIn: [{ file: "app/api/fyp/admin/route.ts", contains: ["Only the department's Chairman signs off FYP results."] }] },
  // Attendance
  { key: "qr-attendance", category: "teaching", task: "Take attendance with a QR code, and mark students by hand", roles: ["INSTRUCTOR"], scope: "Their own courses.",
    where: { href: "/instructor/courses", label: "My Semester Courses › Attendance" }, article: "qr-attendance",
    enforcedIn: [{ file: "lib/instructorGuard.ts", contains: ['user.role !== "INSTRUCTOR"', "course.instructorId !== user.id"] }, { file: "app/api/attendance/sessions/route.ts", contains: ["requireInstructorCourse"] }] },
  { key: "attendance-policy", category: "registration", task: "Set the attendance policy (minimum %, late, excused, QR timing)", roles: ["OMC"], where: { href: "/omc/passing-criteria", label: "Passing Criteria & Attendance" }, article: "attendance-policy",
    enforcedIn: [{ file: "app/api/omc/attendance-threshold/route.ts", contains: ['user.role !== "OMC"'] }] },
  { key: "attendance-report", category: "quality", task: "See attendance shortages across programs", roles: ["PROGRAM_COORDINATOR", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "OMC"], scope: "Their own programs; batch advisors see their batches.",
    where: { href: "/coordinator/attendance", label: "Attendance Report" }, article: "attendance-report",
    enforcedIn: [{ file: "app/coordinator/attendance/page.tsx", contains: ['user.role === "PROGRAM_COORDINATOR"', "OVERVIEW_ROLES.includes(user.role)", "advisorId"] }] },
  // Accreditation governance
  { key: "accreditation-bind", category: "quality", task: "Bind each program to its accreditation council (NCEAC, NBEAC, HEC)", roles: ["CHAIRMAN"], where: { href: "/accreditation/readiness/programs", label: "Visit Readiness › Programs, councils & standards" }, article: "accreditation-councils",
    enforcedIn: [{ file: "app/api/accreditation/governance/route.ts", contains: ["if (!s.canBind)", "Close it before changing the council."] }, { file: "lib/accreditation/governance.ts", contains: ['canBind: user.role === "CHAIRMAN"'] }] },
  { key: "accreditation-standards", category: "quality", task: "Set each council's thresholds (CLO/GA pass marks, ratios, faculty)", roles: ["CHAIRMAN", "OMC"], where: { href: "/accreditation/readiness/programs", label: "Visit Readiness › Programs, councils & standards" }, article: "accreditation-standards",
    enforcedIn: [{ file: "app/api/accreditation/governance/route.ts", contains: ["if (!s.canSetStandards)"] }, { file: "lib/accreditation/governance.ts", contains: ['canSetStandards: user.role === "CHAIRMAN" || user.role === "OMC"'] }] },
  { key: "accreditation-visits", category: "quality", task: "Plan accreditation visits; assign, reassign, withdraw, return and approve their tasks", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], scope: "Deans their faculty's departments; Chairmen their own department.",
    where: { href: "/accreditation/readiness", label: "Visit Readiness" }, article: "assign-accreditation-tasks",
    enforcedIn: [{ file: "lib/accreditation/governance.ts", contains: ['export const MANAGERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"]', "canManage: MANAGERS.includes(user.role)"] }, { file: "app/api/accreditation/cycles/route.ts", contains: ["!s?.canManage"] }, { file: "app/api/accreditation/tasks/[id]/route.ts", contains: ["!!s?.canManage && inScope(s, cycle)", "Only the Institute Head, the Dean or the Chairman can do this."] }] },
  { key: "accreditation-readiness-view", category: "quality", task: "See visit readiness and gaps, and download the dossier", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "OMC"], scope: "Their own departments; a Program Lead their own program.",
    where: { href: "/accreditation/readiness", label: "Visit Readiness" }, article: "visit-readiness",
    enforcedIn: [{ file: "lib/accreditation/governance.ts", contains: ['"DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "OMC"]', "if (!VIEWERS.includes(user.role)) return null;"] }, { file: "app/api/accreditation/cycles/[id]/dossier/route.ts", contains: ["!inScope(s, c)"] }] },
  { key: "accreditation-task-work", category: "quality", task: "Fill in, verify and sign off an accreditation task", roles: ["TASK_ASSIGNEE"], scope: "Only the task given to them, until they sign off, it is withdrawn or its access date passes.",
    where: { href: "/accreditation/tasks", label: "Accreditation Tasks" }, article: "accreditation-task-work",
    enforcedIn: [{ file: "lib/accreditation/governance.ts", contains: ['t.assigneeId === userId && (t.status === "ASSIGNED" || t.status === "RETURNED")', "t.accessUntil > new Date()"] }, { file: "app/api/accreditation/tasks/[id]/route.ts", contains: ["Your access to this task has ended."] }, { file: "lib/sarAccess.ts", contains: ["activeGrants"] }] },
  // Quality & help
  { key: "cqi", category: "quality", task: "Log CQI findings and close the loop", roles: ["CHAIRMAN", "OMC"], where: { href: "/chairman/cqi", label: "CQI Records" }, article: "run-cqi",
    enforcedIn: [{ file: "app/api/chairman/cqi/route.ts", contains: ['["CHAIRMAN", "OMC"].includes(user.role)'] }] },
  { key: "ai-config", category: "help", task: "Set up the institute's AI provider", roles: ["CHAIRMAN"], where: { href: "/chairman/ai-configuration", label: "AI Configuration" }, article: "ai-configuration",
    enforcedIn: [{ file: "app/api/chairman/ai-config/route.ts", contains: ['user.role !== "CHAIRMAN"'] }] },
  { key: "help-articles", category: "help", task: "Write the institute's own help articles and FAQs", roles: ["CHAIRMAN", "SUPER_USER"], scope: "The Super User writes articles for every institute.",
    where: { href: "/help/manage", label: "Manage help" }, article: "ask-for-help",
    enforcedIn: [{ file: "lib/help/access.ts", contains: ['KB_EDITORS = ["CHAIRMAN", "SUPER_USER"]'] }] },
];
