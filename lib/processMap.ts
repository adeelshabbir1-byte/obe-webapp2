// The process map: every working operation of OBEHUB in the order it happens, with what each role does in it.
// One row = one sub-task. Rows with the same `group` (within a phase) run at the same time (coloured together);
// a row without a group waits for the row above. Cell kinds: D does it · R requests / submits · A approves or decides ·
// I is told · V may look. Page /process-map; Excel download /api/process-map. Keep in step with lib/roleMatrix.ts.

export const PM_ROLES = [
  ["IH", "Institute Head", "INSTITUTE_HEAD"], ["DEAN", "Dean", "DEAN"], ["HOD", "HOD", "HEAD_OF_DEPARTMENT"], ["PL", "Program Lead", "PROGRAM_LEAD"],
  ["DC", "Dept. Coordinator", "DEPARTMENT_COORDINATOR"], ["CA", "Course Assigner", "COURSE_ASSIGNER"], ["SE", "Subject Expert", ""], ["OMC", "OMC member", "OMC"],
  ["CONV", "OMC Convener", "OMC_CONVENER"], ["INS", "Instructor", ""], ["LAB", "Lab Engineer", ""], ["ADV", "Advisor", "BATCH_ADVISOR"],
  ["CTRL", "Controller of Exams", "EXAM_CONTROLLER"], ["QEC", "QEC", "QEC_INCHARGE"], ["FIN", "Finance", ""], ["SA", "Student Affairs", ""],
  ["LIB", "Library / Facilities", ""], ["STU", "Student", ""],
] as const;
export type RoleKey = (typeof PM_ROLES)[number][0];
export type Kind = "D" | "R" | "A" | "I" | "V";
export type PmRow = { phase: number; task: string; sub: string; when: string; href?: string; group?: string; cells: Partial<Record<RoleKey, [Kind, string]>> };

export const PHASES: [number, string, string][] = [
  [0, "One-time set-up", "Once, when the institute starts on OBEHUB (and when something changes)"],
  [1, "Programs and curriculum", "Per program; again at each curriculum revision"],
  [2, "Before the semester", "About 8 weeks to 0 weeks before classes"],
  [3, "Start of the semester", "Weeks 1–2"],
  [4, "During the semester", "Weeks 1–16, all running side by side"],
  [5, "Midterm exams", "Around weeks 7–9"],
  [6, "Final exams and results", "Weeks 15–19"],
  [7, "After the semester", "Weeks 19–22"],
  [8, "Yearly and accreditation", "Through the year"],
];

const D = (t: string): [Kind, string] => ["D", t], R = (t: string): [Kind, string] => ["R", t], A = (t: string): [Kind, string] => ["A", t], I = (t: string): [Kind, string] => ["I", t], V = (t: string): [Kind, string] => ["V", t];

export const ROWS: PmRow[] = [
  // ---------------- 0. One-time set-up
  { phase: 0, task: "Institute", sub: "Institute name, logo, position titles (VC / Rector / Director)", when: "Day 1", href: "/chairman/institute-settings", cells: { IH: D("Sets") } },
  { phase: 0, task: "Institute", sub: "Faculties, departments, campuses", when: "Day 1", href: "/chairman/departments", cells: { IH: D("Creates"), DEAN: V("Sees own faculty"), HOD: V("Sees own department") } },
  { phase: 0, task: "People", sub: "Organisation chart: Deans, HODs, Program Leads, coordinators", when: "Week 1", href: "/chairman/org-chart", cells: { IH: D("Builds the chart, drags people into positions"), DEAN: I("Placed in chart"), HOD: I("Placed in chart"), PL: I("Placed in chart"), DC: I("Placed in chart") } },
  { phase: 0, task: "People", sub: "Duties: Controller of Exams, QEC Convener, OMC Conveners and members", when: "Week 1", href: "/chairman/org-chart", group: "A", cells: { IH: D("Names them"), OMC: I("Added to the department's OMC"), CONV: I("Named convener"), CTRL: I("Named Controller"), QEC: I("Named convener / member") } },
  { phase: 0, task: "People", sub: "Faculty accounts and profiles", when: "Week 1", href: "/data-import", group: "A", cells: { IH: D("Imports faculty"), PL: D("Onboards own teachers"), SE: D("Completes profile"), INS: D("Completes profile, photo, qualifications"), LAB: D("Completes profile") } },
  { phase: 0, task: "Records", sub: "Import earlier data: students, past transcripts, rooms, alumni, employers", when: "Week 1–2", href: "/data-import", group: "A", cells: { IH: D("Imports (dry run, then import)"), PL: D("Imports own batches' students and grades"), DC: D("Imports for the department"), LIB: D("Rooms and labs list") } },
  { phase: 0, task: "Rules", sub: "Academic rules: CGPA limits, minimum attendance for exams", when: "Week 1", href: "/academic-rules", group: "B", cells: { CTRL: D("Sets"), DEAN: A("Can set / agrees"), IH: V("Sees"), PL: V("Sees"), ADV: V("Uses for advising") } },
  { phase: 0, task: "Rules", sub: "Grading scale of each program", when: "Week 1", href: "/coordinator/grading-scale", group: "B", cells: { PL: D("Sets letter grades and points"), OMC: V("Sees") } },
  { phase: 0, task: "Rules", sub: "Passing criteria, assessment-type rules, weight policy", when: "Week 1", href: "/omc/assessment-rules", group: "B", cells: { CONV: D("Sets for own department"), OMC: D("Drafts"), HOD: A("Agrees"), SE: V("Must follow"), INS: V("Must follow") } },
  { phase: 0, task: "Rules", sub: "Registration rules (auto-registration, holds for low CGPA)", when: "Week 1", href: "/registration-rules", group: "B", cells: { CTRL: D("Sets"), PL: V("Sees"), ADV: V("Decides held students later") } },
  { phase: 0, task: "Finance", sub: "Fee structure per program, bank / JazzCash / Easypaisa details, fee holds", when: "Week 1", href: "/fees", group: "B", cells: { FIN: D("Sets"), IH: A("Approves fee structure") } },
  { phase: 0, task: "Systems", sub: "Moodle link, SMS / WhatsApp gateway, backups", when: "Week 1", href: "/chairman/lms", group: "B", cells: { IH: D("Links Moodle and messaging; backups run weekly") } },

  // ---------------- 1. Programs and curriculum
  { phase: 1, task: "New program", sub: "Proposal → feasibility → BOS → BOF → Academic Council → HEC NOC", when: "Months before launch", href: "/quality-office/program_proposal", cells: { HOD: R("Proposes"), DEAN: A("Board of Faculty"), IH: A("Academic Council"), QEC: D("Records stages, minutes; creates program when approved") } },
  { phase: 1, task: "Program profile", sub: "Vision, mission, PEOs, level, council (NCEAC / NBEAC / PEC)", when: "Before first intake", href: "/coordinator/program-profile", cells: { PL: D("Writes"), HOD: A("Agrees"), IH: D("Sets the council"), QEC: V("Sees") } },
  { phase: 1, task: "Program profile", sub: "Graduate attributes (GAs / PLOs) of each batch", when: "Before first intake", href: "/coordinator/plos", cells: { PL: D("Sets or imports"), CONV: A("Agrees"), OMC: V("Maps courses to them") } },
  { phase: 1, task: "Program profile", sub: "GA change request", when: "When needed", href: "/omc/plo-requests", cells: { PL: R("Asks"), SE: R("Asks"), OMC: A("Decides"), CONV: A("Decides if members differ") } },
  { phase: 1, task: "Scheme of studies", sub: "Batches, course catalogue, semesters, prerequisites, electives", when: "Before first intake", href: "/coordinator/courses", cells: { PL: D("Builds or imports curriculum"), HOD: A("Agrees"), DEAN: A("Approves curriculum"), OMC: V("Reviews coverage") } },
  { phase: 1, task: "Scheme of studies", sub: "Course home department (whose subject each course is)", when: "Before first intake", href: "/courses-in-degree", cells: { PL: D("Sets per course"), HOD: V("Sees where own courses are used") } },
  { phase: 1, task: "Scheme of studies", sub: "Course moved to another semester / equivalence of old and new courses", when: "When needed", href: "/omc/course-repositioning", cells: { PL: R("Asks"), OMC: A("Moves / pairs courses") } },
  { phase: 1, task: "Scheme of studies", sub: "Program specification and PQR registration", when: "After approval", href: "/program-spec", cells: { QEC: D("Prints spec, records PQR"), PL: V("Sees") } },

  // ---------------- 2. Before the semester
  { phase: 2, task: "Calendar", sub: "Academic calendar of the year (start, exams, breaks)", when: "Week −8", href: "/academic-calendar", cells: { IH: D("Sets"), DEAN: V("Sees"), PL: V("Sees"), STU: V("Sees") } },
  { phase: 2, task: "Semester set-up", sub: "Semester dates, current term", when: "Week −8", href: "/coordinator/semester", group: "C", cells: { PL: D("Sets") } },
  { phase: 2, task: "Semester set-up", sub: "Offer courses and sections; repeat / summer offering", when: "Week −8", href: "/coordinator/semester", group: "C", cells: { PL: D("Offers"), HOD: A("Agrees"), INS: I("Sees offered courses") } },
  { phase: 2, task: "Semester set-up", sub: "Course split / a course taught by another department", when: "Week −8", href: "/course-split", group: "C", cells: { PL: R("Asks the other department"), HOD: A("Accepts for own department"), DEAN: A("Can accept") } },
  { phase: 2, task: "Semester set-up", sub: "Assign a Subject Expert to each course", when: "Week −7", href: "/coordinator/assign-subject-experts", group: "C", cells: { PL: D("Assigns"), SE: I("Told which courses") } },
  { phase: 2, task: "Semester set-up", sub: "Teachers' course preferences and free times", when: "Week −7", href: "/faculty/course-preferences", group: "C", cells: { INS: D("Enters"), SE: D("Enters"), CA: V("Uses for allocation") } },
  { phase: 2, task: "Course design", sub: "CLOs with Bloom level, each mapped to a GA (labs → Modern Tool Usage)", when: "Week −7 to −4", href: "/subjectexpert/courses", cells: { SE: D("Writes"), PL: V("Sees progress"), INS: V("Sees later") } },
  { phase: 2, task: "Course design", sub: "Lecture plan: topics and sub-topics per lecture, mapped to CLOs", when: "Week −7 to −4", href: "/faculty/topic-workspace", cells: { SE: D("Writes") } },
  { phase: 2, task: "Course design", sub: "Assessment plan: quizzes, assignments, mid, final, weights; topics each covers", when: "Week −6 to −4", href: "/subjectexpert/courses", cells: { SE: D("Writes") } },
  { phase: 2, task: "Course design", sub: "Weight exception (weights outside the policy)", when: "When needed", href: "/omc/weight-exceptions", cells: { SE: R("Asks with a reason"), OMC: A("Decides"), CONV: A("Decides if members differ") } },
  { phase: 2, task: "OMC review", sub: "Course design submitted, shared out, reviewed", when: "Week −4 to −2", href: "/omc/queue", cells: { SE: R("Submits"), CONV: D("Shares out among members"), OMC: A("Approves or asks for changes"), PL: I("Told") } },
  { phase: 2, task: "OMC review", sub: "Changes asked → corrected → approved", when: "Week −3 to −1", href: "/subjectexpert/courses", cells: { SE: D("Corrects and resubmits"), OMC: A("Approves") } },
  { phase: 2, task: "Allocation", sub: "Who teaches what (course allocation matrix)", when: "Week −4 to −2", href: "/assigner/matrix", group: "D", cells: { CA: D("Allocates"), HOD: A("Approves"), INS: I("Told own courses"), PL: V("Sees") } },
  { phase: 2, task: "Allocation", sub: "Borrow a teacher from another department", when: "Week −4", href: "/hod/borrow-teacher", group: "D", cells: { PL: R("Asks"), HOD: A("Other department's HOD lends"), INS: I("Told") } },
  { phase: 2, task: "Allocation", sub: "Course team and Course Lead (several sections)", when: "Week −3", href: "/course-leads", group: "D", cells: { HOD: D("Chooses Course Lead"), PL: D("Can choose"), INS: I("Course Lead finalises papers") } },
  { phase: 2, task: "Allocation", sub: "Lab Engineer for each lab; lab under its theory course", when: "Week −3", href: "/coordinator/lab-engineers", group: "D", cells: { PL: D("Assigns"), LAB: I("Told own labs"), INS: I("Lab Engineer reports to the theory teacher") } },
  { phase: 2, task: "Timetable", sub: "Timetable (rooms of the batch's campus), clash check", when: "Week −2", href: "/coordinator/timetable", cells: { PL: D("Generates and adjusts"), DC: D("For the department"), INS: V("Own timetable"), LAB: V("Own timetable"), STU: V("Own timetable") } },
  { phase: 2, task: "Registration", sub: "Every student registered in the batch's offered courses", when: "Week −1", href: "/coordinator/students", cells: { PL: D("Opens registration (automatic)"), STU: I("Courses appear") } },
  { phase: 2, task: "Registration", sub: "Low-CGPA students held for the advisor", when: "Week −1", href: "/advisor/registration-holds", cells: { ADV: A("Chooses their courses"), STU: I("Told the decision") } },
  { phase: 2, task: "Fees", sub: "Fee invoices of the term issued", when: "Week −2", href: "/fees", group: "E", cells: { FIN: D("Issues per batch"), STU: I("Challan in portal, SMS") } },
  { phase: 2, task: "Library", sub: "Required books of each course", when: "Week −2", href: "/coordinator/required-books", group: "E", cells: { PL: R("Lists books"), LIB: D("Buys / reserves") } },

  // ---------------- 3. Start of the semester
  { phase: 3, task: "Course start", sub: "Instructor takes the approved course file", when: "Week 1", href: "/instructor/courses", cells: { INS: D("Opens course, checks plan") } },
  { phase: 3, task: "Course start", sub: "Change to the approved template (topics, weights)", when: "Week 1–2", href: "/omc/template-changes", cells: { INS: R("Asks"), OMC: A("Approves or refuses"), SE: I("Told") } },
  { phase: 3, task: "Registration changes", sub: "Add / drop, elective choice", when: "Week 1–2", href: "/student/registration", group: "F", cells: { STU: R("Asks"), ADV: A("Approves if off-plan or on probation") } },
  { phase: 3, task: "Registration changes", sub: "Course from another batch (out-of-batch)", when: "Week 1–2", href: "/coordinator/out-of-batch-requests", group: "F", cells: { STU: R("Asks"), PL: A("Approves") } },
  { phase: 3, task: "Registration changes", sub: "Degree plan change", when: "Week 1–2", href: "/plan-requests", group: "F", cells: { STU: R("Asks"), ADV: A("Approves") } },

  // ---------------- 4. During the semester
  { phase: 4, task: "Teaching", sub: "Lectures as planned; weekly plan; topics taught", when: "Weeks 1–16", href: "/instructor/courses", group: "G", cells: { INS: D("Teaches, ticks topics taught"), OMC: V("Delivery review"), PL: V("Semester health") } },
  { phase: 4, task: "Teaching", sub: "Attendance (by hand or QR)", when: "Every class", href: "/instructor/courses", group: "G", cells: { INS: D("Marks"), LAB: D("Marks labs"), ADV: V("Sees shortages"), STU: V("Sees own, weekly alert if low") } },
  { phase: 4, task: "Teaching", sub: "Quizzes, assignments, projects: marks (or from Moodle)", when: "As planned", href: "/instructor/courses", group: "G", cells: { INS: D("Enters marks"), STU: V("Sees marks") } },
  { phase: 4, task: "Labs", sub: "Lab manual vetted before each lab", when: "Before each lab", href: "/lab-engineer/labs", group: "G", cells: { LAB: R("Uploads manual"), INS: A("Vets") } },
  { phase: 4, task: "Labs", sub: "Lab sessions and lab marks", when: "Weekly", href: "/lab-engineer/labs", group: "G", cells: { LAB: D("Runs, marks"), INS: A("Approves lab marks into theory") } },
  { phase: 4, task: "Students", sub: "Early warning, advising, counselling", when: "Weekly", href: "/advisor/dashboard", group: "G", cells: { ADV: D("Meets students at risk"), SA: D("Counselling"), PL: V("Sees"), STU: R("Books counselling") } },
  { phase: 4, task: "Students", sub: "Complaints, societies, activities", when: "Any time", href: "/complaints", group: "G", cells: { STU: R("Raises"), SA: D("Handles") } },
  { phase: 4, task: "Students", sub: "Fee payments (bank / JazzCash / Easypaisa) and verification", when: "Until due date", href: "/fees", group: "G", cells: { STU: D("Pays, enters transaction no."), FIN: A("Verifies, posts") } },
  { phase: 4, task: "Students", sub: "Library loans and returns", when: "Any time", href: "/library-desk", group: "G", cells: { STU: D("Borrows"), LIB: D("Issues, fines") } },
  { phase: 4, task: "Staff", sub: "Leave and class cover", when: "Any time", href: "/leave-approvals", group: "G", cells: { INS: R("Applies, names cover"), HOD: A("Approves"), DEAN: A("Approves long leave") } },
  { phase: 4, task: "Staff", sub: "Meetings, FDP sessions, room bookings", when: "Any time", href: "/meeting-planner", group: "G", cells: { HOD: D("Calls meetings, FDP"), INS: D("Attends"), LIB: D("Rooms") } },
  { phase: 4, task: "Feedback", sub: "Course and teacher feedback window", when: "Weeks 10–12", href: "/evaluations/questionnaires", group: "G", cells: { QEC: D("Opens window, questionnaires"), STU: D("Gives feedback (anonymous)"), INS: V("Results after enough answers"), HOD: V("Sees") } },
  { phase: 4, task: "Follow-up", sub: "Topic follow-ups and remediation", when: "As needed", href: "/follow-ups", group: "G", cells: { SE: D("Flags"), INS: D("Extra classes / tutorials") } },

  // ---------------- 5. Midterm
  { phase: 5, task: "Exam set-up", sub: "Exam session, date sheet, rooms and seating", when: "Week 6", href: "/exams", cells: { CTRL: D("Creates and publishes"), PL: R("Lists invigilators"), INS: I("Told duties"), STU: I("Date sheet") } },
  { phase: 5, task: "Paper", sub: "Midterm paper made and vetted", when: "Week 6–7", href: "/paper-vetting", cells: { INS: R("Course Lead submits"), OMC: A("Vets against CLOs / Bloom"), CONV: A("Decides if members differ"), CTRL: I("Paper ready") } },
  { phase: 5, task: "Exam", sub: "Invigilation; duty swaps", when: "Week 8", href: "/exams", group: "H", cells: { INS: D("Invigilates; swaps duty"), CTRL: A("Approves late swaps") } },
  { phase: 5, task: "Exam", sub: "Midterm marks entered", when: "Week 9", href: "/instructor/courses", group: "H", cells: { INS: D("Enters"), STU: V("Sees") } },

  // ---------------- 6. Finals and results
  { phase: 6, task: "Exam set-up", sub: "Final exam session, date sheet, seating", when: "Week 14", href: "/exams", group: "I", cells: { CTRL: D("Creates and publishes"), INS: I("Duties"), STU: I("Date sheet") } },
  { phase: 6, task: "Exam set-up", sub: "Final paper made and vetted", when: "Week 14–15", href: "/paper-vetting", group: "I", cells: { INS: R("Course Lead submits"), OMC: A("Vets"), CONV: A("Decides") } },
  { phase: 6, task: "Exam set-up", sub: "Debarred list (short attendance); condone with reason", when: "Week 15", href: "/controller?tab=debar", cells: { CTRL: D("Issues, condones"), INS: I("Told"), ADV: I("Told"), STU: I("Told") } },
  { phase: 6, task: "Exam set-up", sub: "Admit cards (held if fee outstanding)", when: "Week 15", href: "/controller?tab=debar", cells: { CTRL: D("Prints by batch"), FIN: V("Fee holds"), STU: D("Prints own") } },
  { phase: 6, task: "Exam", sub: "Final exam and marking", when: "Weeks 16–17", href: "/instructor/courses", cells: { INS: D("Invigilates, marks"), CTRL: D("Runs the exams") } },
  { phase: 6, task: "Result", sub: "Grade cut-offs set; result submitted", when: "Week 18", href: "/instructor/courses", cells: { INS: R("Submits result"), PL: V("Sees") } },
  { phase: 6, task: "Result", sub: "Result approved or returned", when: "Week 18", href: "/results-approval", cells: { HOD: A("Approves / returns"), CONV: A("Approves (OMC)"), IH: A("Covers when vacant"), INS: I("Told") } },
  { phase: 6, task: "Result", sub: "Result published; re-checking window opens", when: "Week 19", href: "/controller?tab=results", cells: { CTRL: D("Publishes"), STU: I("Final grade, SMS") } },
  { phase: 6, task: "Result", sub: "Re-checking request", when: "Within the window", href: "/student/recheck", cells: { STU: R("Asks"), CTRL: A("Decides"), INS: D("Re-checks") } },
  { phase: 6, task: "Result", sub: "Grade change after publication", when: "When needed", href: "/results-approval", cells: { INS: R("Asks with a reason"), HOD: A("Approves"), CTRL: A("Approves"), STU: I("Told") } },

  // ---------------- 7. After the semester
  { phase: 7, task: "Outcomes", sub: "CLO and GA attainment of every course and student", when: "Week 19", href: "/outcome-flow", group: "J", cells: { PL: V("Program attainment"), SE: V("Course attainment"), OMC: V("Reports"), STU: V("Own GA transcript") } },
  { phase: 7, task: "Outcomes", sub: "CQI: actions for CLOs / GAs not met", when: "Week 19–20", href: "/chairman/cqi", group: "J", cells: { SE: D("Writes actions"), PL: D("Program actions"), CONV: A("Agrees"), QEC: V("Sees") } },
  { phase: 7, task: "Course file", sub: "Delivery completion and course file", when: "Week 19–20", href: "/omc/delivery-completion", group: "J", cells: { INS: D("Completes"), OMC: A("Reviews") } },
  { phase: 7, task: "Records", sub: "Transcripts, standing (merit) lists", when: "Week 20", href: "/controller?tab=standing", group: "J", cells: { CTRL: D("Issues"), PL: V("Sees"), STU: V("Own transcript") } },
  { phase: 7, task: "Records", sub: "Student status: freeze, drop, transfer, readmission, left", when: "Any time", href: "/status-changes", group: "J", cells: { ADV: R("Raises"), PL: R("Raises"), HOD: A("Approves"), CTRL: A("Final approval"), FIN: I("Fee clearance"), LIB: I("Library clearance"), STU: I("Told") } },
  { phase: 7, task: "Fees", sub: "Late fines, concessions, refunds", when: "Week 20", href: "/fee-refunds", group: "J", cells: { FIN: D("Applies"), IH: A("Approves refunds"), STU: R("Asks refund") } },
  { phase: 7, task: "Reports", sub: "Semester reports: results, attainment, feedback, workload", when: "Week 21", href: "/head-dashboard", group: "J", cells: { IH: V("Institute"), DEAN: V("Faculty"), HOD: V("Department"), PL: V("Program") } },

  // ---------------- 8. Yearly and accreditation
  { phase: 8, task: "Surveys", sub: "Alumni and employer surveys (PEO attainment), exit surveys", when: "Yearly", href: "/coordinator/surveys", group: "K", cells: { PL: D("Sends"), QEC: D("Runs institute surveys"), SA: D("Exit surveys") } },
  { phase: 8, task: "Faculty", sub: "Faculty survey, appraisal, FDP plan, research", when: "Yearly", href: "/appraisals", group: "K", cells: { INS: D("Fills survey, replies to appraisal"), HOD: D("Appraises, plans FDP"), DEAN: A("Signs off"), QEC: D("Faculty survey") } },
  { phase: 8, task: "Faculty", sub: "Recruitment: request, advert, scoring, board, hire", when: "When needed", href: "/recruitment", group: "K", cells: { HOD: R("Asks to hire"), DEAN: A("Agrees"), IH: A("Appoints"), FIN: I("Budget") } },
  { phase: 8, task: "Quality", sub: "Program self-assessment (SAR) and QAA cycle", when: "Yearly", href: "/qaa", group: "K", cells: { PL: D("Writes SAR"), QEC: D("Runs the cycle"), HOD: A("Agrees"), DEAN: V("Sees") } },
  { phase: 8, task: "Quality", sub: "IPE self-assessment (11 standards) and action plan", when: "Yearly", href: "/ipe", group: "K", cells: { QEC: D("Scores, evidence, actions"), IH: A("Approves"), DEAN: D("Contributes") } },
  { phase: 8, task: "Quality", sub: "Quality Office: Citizen Portal, rankings, reviews, awareness, affiliated colleges, yearly plan", when: "Through the year", href: "/quality-office", group: "K", cells: { QEC: D("Keeps the registers"), HOD: D("Department review, replies"), IH: V("Annual QA report") } },
  { phase: 8, task: "Accreditation", sub: "Readiness check of each program", when: "Before a visit", href: "/accreditation/readiness", cells: { PL: V("Gaps"), HOD: V("Gaps"), DEAN: V("Gaps"), IH: V("Overview") } },
  { phase: 8, task: "Accreditation", sub: "Visit opened, tasks assigned, evidence, sign-off", when: "Months before a visit", href: "/accreditation/tasks", cells: { DEAN: D("Opens visit"), HOD: D("Assigns tasks"), PL: D("Does tasks, evidence"), IH: A("Approves"), QEC: V("Sees") } },
  { phase: 8, task: "Accreditation", sub: "Council portal data (NCEAC students / faculty files), HEMIS", when: "Before submission", href: "/accreditation/nceac-portal", cells: { PL: D("Completes data"), QEC: D("HEMIS export"), INS: D("Own details") } },
  { phase: 8, task: "Degrees", sub: "Clearance, degree audit, degree issue, verification", when: "After the final semester", href: "/degrees", cells: { CTRL: D("Issues degree"), FIN: A("Fee clearance"), LIB: A("Library clearance"), IH: A("Signs"), STU: R("Applies") } },
];

/** Background colour for a parallel group (rows with the same letter in a phase run at the same time). */
export const GROUP_COLOR: Record<string, string> = { A: "#DFF3E3", B: "#DCEBFA", C: "#DFF3E3", D: "#EDE3F7", E: "#FFF0D6", F: "#DCEBFA", G: "#DFF3E3", H: "#EDE3F7", I: "#FFF0D6", J: "#DCEBFA", K: "#DFF3E3" };
export const KIND_LABEL: Record<Kind, string> = { D: "does it", R: "requests / submits", A: "approves / decides", I: "is told", V: "may look" };
export const KIND_STYLE: Record<Kind, { color: string; weight: number }> = { D: { color: "#0D2A4A", weight: 800 }, R: { color: "#8A4B00", weight: 700 }, A: { color: "#1E6B34", weight: 700 }, I: { color: "#6B7177", weight: 400 }, V: { color: "#8C9399", weight: 400 } };
