import type { BodyKey } from "./bodyInfer";

// Each council's requirements as discrete, assignable accreditation tasks.
//
// A task says what the inspectors look for, which data the system already holds for it (its sources — filled in
// automatically, the assignee only verifies), what the assignee confirms, and where the underlying data is kept.
// NCEAC tasks follow the nine criteria of the NCEAC Accreditation Manual (as Accreditation Overview does); NBEAC tasks
// follow Forms 1–7 of SAR 4.0 (as the NBEAC SAR builder does); HEC tasks follow the eight criteria of HEC's
// Self-Assessment Manual for general programs. A task of one council never appears for another council's program.

export type SourceKey =
  | "faculty" | "facultyLoad" | "courseFiles" | "curriculum" | "plos" | "ploAttainment" | "results" | "surveys" | "outcomes"
  | "studentSupport" | "lab" | "library" | "finance" | "cqi" | "industry" | "meetings" | "facilities" | "readiness" | "nbeac";

export type TaskField = { key: string; label: string; type: "textarea" | "text" | "date" };
export type TaskDef = {
  code: string; group: string; title: string; purpose: string; sources: SourceKey[]; checklist: string[]; fields?: TaskField[];
  pages: { href: string; label: string }[];
  /** Roles this task is usually given to (the assign list shows them first). */
  suggested: string[];
  /** NCEAC: the criterion whose readiness checks count towards the task. */
  criterion?: number;
  /** NBEAC: the SAR form and the item codes the task covers, and the registers / profile sections its assignee may edit. */
  sarForm?: string; sarCodes?: RegExp; sarKinds?: string[]; sarSections?: string[];
  /** NCEAC / HEC: the evidence-file criterion whose documents go into this task's folder of the dossier. */
  evidenceCriterion?: number;
};
export type GroupDef = { key: string; title: string };

const PL = "PROGRAM_COORDINATOR", INS = "INSTRUCTOR", HOD = "HEAD_OF_DEPARTMENT", DC = "DEPARTMENT_COORDINATOR", SA = "STUDENT_AFFAIRS";
const LIB = "LIBRARIAN", FIN = "FINANCE_OFFICER", LM = "LAB_MANAGER", FAC = "FACILITIES_MANAGER", OMC = "OMC", SE = "SUBJECT_EXPERT";
const NOTE: TaskField = { key: "note", label: "Notes for the inspectors (what to look at, explanations of gaps)", type: "textarea" };

// ---------------------------------------------------------------------------------------------------- NCEAC
const NCEAC_GROUPS: GroupDef[] = [
  { key: "1", title: "Program Objectives" }, { key: "2", title: "Graduate Attributes" }, { key: "3", title: "Curriculum and Learning Process" },
  { key: "4", title: "Students" }, { key: "5", title: "Faculty and Support Staff" }, { key: "6", title: "Facilities and Infrastructure" },
  { key: "7", title: "Institutional Support and Financial Resources" }, { key: "8", title: "Steps to Improve the Program" }, { key: "9", title: "Industrial Linkages" },
];
const NCEAC_TASKS: TaskDef[] = [
  { code: "1.1", group: "1", title: "Program objectives, vision and mission", criterion: 1, evidenceCriterion: 1, suggested: [PL, DC],
    purpose: "The vision, mission and program objectives (POs), approved by the statutory body, with KPIs to measure them.",
    sources: ["readiness", "meetings"], checklist: ["The vision, mission and POs match the approved Program Document", "The approving body's minutes are on file", "KPIs for each PO are recorded"],
    fields: [NOTE], pages: [{ href: "/coordinator/program-profile", label: "Program Document" }, { href: "/coordinator/evidence", label: "Accreditation Evidence" }] },
  { code: "1.2", group: "1", title: "Alumni and employer feedback summaries", criterion: 1, suggested: [PL, DC, SA],
    purpose: "Alumni, employer and student surveys: response counts, findings and the action taken on them.",
    sources: ["surveys"], checklist: ["Each survey's findings and the action taken are written", "Response counts are correct"], fields: [NOTE],
    pages: [{ href: "/outcomes", label: "Graduation & Surveys" }, { href: "/coordinator/surveys", label: "Feedback Surveys" }] },
  { code: "2.1", group: "2", title: "Graduate attributes (PLOs) and their mapping", criterion: 2, evidenceCriterion: 2, suggested: [PL],
    purpose: "The PLOs of every batch, approved, and mapped to the courses that teach them.",
    sources: ["plos", "readiness"], checklist: ["Every batch's PLOs are approved", "Every PLO is covered by at least one course"], fields: [NOTE],
    pages: [{ href: "/coordinator/plos", label: "Program Learning Outcomes" }, { href: "/omc/plo-matrix", label: "PLO–Course Matrix" }] },
  { code: "2.2", group: "2", title: "PLO attainment report", suggested: [PL, OMC],
    purpose: "How many students attained each PLO in the latest term, against the benchmark.",
    sources: ["ploAttainment"], checklist: ["Attainment below the benchmark is explained, with the action planned"], fields: [NOTE],
    pages: [{ href: "/omc/reports/attainment-analytics", label: "Attainment analytics" }] },
  { code: "3.1", group: "3", title: "Curriculum and scheme of studies", criterion: 3, evidenceCriterion: 3, suggested: [PL],
    purpose: "Credit hours, the spread over eight semesters, the final year project and the HEC course coverage of each batch.",
    sources: ["curriculum", "readiness"], checklist: ["The scheme of studies matches the approved curriculum", "Differences from the HEC curriculum are explained"], fields: [NOTE],
    pages: [{ href: "/coordinator/courses", label: "Courses" }, { href: "/coordinator/hec-comparison", label: "Curriculum vs HEC" }] },
  { code: "3.2", group: "3", title: "Course file audit", suggested: [PL, INS, DC],
    purpose: "A complete folder for every offered course: outline, CLOs, lecture plan, papers, marked scripts and results.",
    sources: ["courseFiles"], checklist: ["I have opened every course folder marked as kept", "Missing folders are listed in the notes"], fields: [NOTE],
    pages: [{ href: "/coordinator/course-folders", label: "Course Folders" }] },
  { code: "4.1", group: "4", title: "Admissions, intake and graduation figures", criterion: 4, evidenceCriterion: 4, suggested: [PL, DC, SA],
    purpose: "Admitted, graduated, on-time and dropped-out students for each intake year, and the admission criteria.",
    sources: ["outcomes"], checklist: ["The figures match the admission office's records"], fields: [NOTE],
    pages: [{ href: "/outcomes", label: "Graduation & Surveys" }, { href: "/admission-criteria", label: "Admission Criteria" }] },
  { code: "4.2", group: "4", title: "Student advising, counselling and class sizes", criterion: 4, suggested: [PL, DC],
    purpose: "An advisor for every batch, counselling held, and sections within the class-size limit.",
    sources: ["studentSupport"], checklist: ["Advisors are in post", "Counselling sessions are recorded"], fields: [NOTE],
    pages: [{ href: "/coordinator/batches", label: "Degree Programs & Batches" }, { href: "/coordinator/evidence", label: "Accreditation Evidence" }] },
  { code: "5.1", group: "5", title: "Faculty qualification register", criterion: 5, evidenceCriterion: 5, suggested: [HOD, PL],
    purpose: "Every teacher's highest degree, designation, full-time or visiting status and experience, checked against the documents.",
    sources: ["faculty"], checklist: ["Every faculty profile has been checked against the degree documents", "Visiting faculty are marked as visiting"], fields: [NOTE],
    pages: [{ href: "/faculty-report", label: "Faculty Details Report" }] },
  { code: "5.2", group: "5", title: "Faculty load and development", criterion: 5, suggested: [PL, HOD],
    purpose: "Teaching loads within the limit, training attended and research recorded.",
    sources: ["facultyLoad"], checklist: ["Loads above the limit are explained"], fields: [NOTE],
    pages: [{ href: "/coordinator/load-report", label: "Teacher Load Report" }] },
  { code: "6.1", group: "6", title: "Laboratories and computing facilities", criterion: 6, evidenceCriterion: 6, suggested: [LM, PL],
    purpose: "Labs, working computers and their specification, against the students who use them.",
    sources: ["lab"], checklist: ["The lab inventory was counted this semester"], fields: [NOTE],
    pages: [{ href: "/lab-inventory", label: "Lab Inventory" }] },
  { code: "6.2", group: "6", title: "Library resources and textbook requisitions", criterion: 6, suggested: [LIB],
    purpose: "Book titles, journals, digital libraries and the textbooks ordered for this program's courses.",
    sources: ["library"], checklist: ["The library figures were counted this year", "Requisitions for this term are recorded"], fields: [NOTE],
    pages: [{ href: "/library-inventory", label: "Library Inventory" }, { href: "/library/requisitions", label: "Textbook Requisitions" }] },
  { code: "7.1", group: "7", title: "Budget and financial support", criterion: 7, evidenceCriterion: 7, suggested: [FIN],
    purpose: "This year's budget for the program's labs, library, faculty development and research, against last year.",
    sources: ["finance"], checklist: ["The figures match the approved budget"], fields: [NOTE],
    pages: [{ href: "/chairman/finance", label: "Finance" }] },
  { code: "8.1", group: "8", title: "CQI and improvement actions", criterion: 8, evidenceCriterion: 8, suggested: [PL, OMC],
    purpose: "Findings from reviews and audits, the action taken and its effect — closing the loop.",
    sources: ["cqi", "readiness"], checklist: ["Every open finding has an action and a person responsible"], fields: [NOTE],
    pages: [{ href: "/chairman/cqi", label: "CQI Records" }] },
  { code: "8.2", group: "8", title: "Course results and assessment approval", suggested: [PL],
    purpose: "Every offered course's result submitted and approved.",
    sources: ["results"], checklist: ["Results still waiting are followed up"], fields: [NOTE],
    pages: [{ href: "/results-approval", label: "Result Approval" }] },
  { code: "9.1", group: "9", title: "Industrial linkages and advisory board", criterion: 9, evidenceCriterion: 9, suggested: [PL, DC],
    purpose: "The industrial advisory board, its meetings, MoUs, internships and joint projects.",
    sources: ["industry", "readiness"], checklist: ["Advisory board minutes are on file", "MoUs are signed copies"], fields: [NOTE],
    pages: [{ href: "/coordinator/evidence", label: "Accreditation Evidence" }, { href: "/meetings", label: "Meetings & Minutes" }] },
];

// ---------------------------------------------------------------------------------------------------- NBEAC
const NBEAC_GROUPS: GroupDef[] = [
  { key: "1", title: "Strategic Management" }, { key: "2", title: "Curriculum" }, { key: "3", title: "Students" }, { key: "4", title: "Faculty" },
  { key: "5", title: "Research and Development" }, { key: "6", title: "External Linkages and Outreach" }, { key: "7", title: "Institutional Resources" },
];
const NBEAC_TASKS: TaskDef[] = [
  { code: "1.1", group: "1", title: "Institution, school and governance", sarForm: "1", sarCodes: /^(Table (A|B|C|1\.[1-9]\w*)|1\.\d+\w*)$/, suggested: [HOD, DC],
    sarKinds: ["STRATEGIC_PLAN", "STATUTORY_BODY", "BODY_MEMBER", "QA_REVIEW", "AUDIT"], sarSections: ["SCHOOL", "CONTACTS"],
    purpose: "Tables A–C and 1.1–1.9: the school's profile, strategic plan, statutory bodies and their members, QA reviews and audits.",
    sources: ["nbeac", "meetings"], checklist: ["The school profile and contacts are current", "Statutory body memberships match the notifications"], fields: [NOTE],
    pages: [{ href: "/accreditation/governance", label: "Accreditation data: governance" }] },
  { code: "1.2", group: "1", title: "Policies and manuals (SAR appendices)", sarForm: "1", sarCodes: /^Appendix /, sarKinds: ["POLICY"], suggested: [HOD, DC],
    purpose: "Every approved policy and manual the SAR asks for as an appendix, with its approving body and date.",
    sources: ["nbeac"], checklist: ["Each document is the approved version"], fields: [NOTE],
    pages: [{ href: "/accreditation/policies", label: "Accreditation data: policies" }] },
  { code: "2.1", group: "2", title: "Curriculum and program portfolio", sarForm: "2", sarCodes: /^(Table 2\.([1-9]|10|11)\w*|Q 2\.6|2\.\d+\w*)$/, sarKinds: ["CURRICULUM_REVIEW", "INDIGENOUS_MATERIAL"], suggested: [PL, HOD],
    purpose: "Programs, their approval and launch, the PEO–PLO map, course design and curriculum reviews (Tables 2.1–2.11).",
    sources: ["nbeac", "curriculum"], checklist: ["Program levels and approval dates are entered", "The PEO–PLO map is complete"], fields: [NOTE],
    pages: [{ href: "/coordinator/program-profile", label: "Program Document" }, { href: "/accreditation/curriculum", label: "Accreditation data: curriculum" }] },
  { code: "2.2", group: "2", title: "Course file audit", suggested: [PL, INS, DC],
    purpose: "A complete folder for every offered course.", sources: ["courseFiles"], checklist: ["I have opened every course folder marked as kept"], fields: [NOTE],
    pages: [{ href: "/coordinator/course-folders", label: "Course Folders" }] },
  { code: "2.3", group: "2", title: "Assessment of learning outcomes", suggested: [PL, OMC],
    purpose: "PLO attainment against the benchmark and course results approved.", sources: ["ploAttainment", "results"], checklist: ["Attainment below the benchmark is explained"], fields: [NOTE],
    pages: [{ href: "/omc/reports/attainment-analytics", label: "Attainment analytics" }] },
  { code: "3.1", group: "3", title: "Admissions and student profile", sarForm: "3", sarCodes: /^(Table 3\.[1-6]\w*|3\.6)$/, sarKinds: ["ADMISSION_STATS", "SELECTION_TOOL"], suggested: [SA, DC],
    purpose: "Admissions per intake, selection tools, the student profile, dropouts and probation (Tables 3.1–3.6).",
    sources: ["nbeac", "outcomes"], checklist: ["Admission figures match the admission office"], fields: [NOTE],
    pages: [{ href: "/accreditation/students", label: "Accreditation data: students" }] },
  { code: "3.2", group: "3", title: "Counselling, internships and placement", sarForm: "3", sarCodes: /^(Table 3\.(7|8|9|10|11|13)\w*|3\.13b)$/, sarKinds: ["COUNSELING", "PSYCH_COUNSELING", "INTERNSHIP_STATS", "PLACEMENT_ACTIVITY"], suggested: [SA, DC],
    purpose: "Academic and psychological counselling, internships, placement and societies (Tables 3.7–3.13).",
    sources: ["nbeac", "studentSupport"], checklist: ["Counselling and placement records are complete for the year"], fields: [NOTE],
    pages: [{ href: "/accreditation/students", label: "Accreditation data: students" }, { href: "/student-activities", label: "Student Societies" }] },
  { code: "3.3", group: "3", title: "Alumni and employer feedback summaries", suggested: [PL, SA],
    purpose: "Alumni, employer and student surveys: response counts, findings and the action taken.", sources: ["surveys"], checklist: ["Each survey's findings and action are written"], fields: [NOTE],
    pages: [{ href: "/outcomes", label: "Graduation & Surveys" }] },
  { code: "4.1", group: "4", title: "Faculty qualification register", sarForm: "4", sarCodes: /^Table 4\.1\w*$/, suggested: [HOD, PL],
    purpose: "Tables 4.1a–g: every teacher's qualification, designation, experience, FTE and teaching load, checked against the documents.",
    sources: ["faculty", "nbeac"], checklist: ["Every faculty profile has been checked against the degree documents"], fields: [NOTE],
    pages: [{ href: "/faculty-report", label: "Faculty Details Report" }] },
  { code: "4.2", group: "4", title: "Faculty workload, development and engagement", sarForm: "4", sarCodes: /^Table 4\.([2-8])\w*$/, suggested: [HOD, PL],
    sarKinds: ["WORKLOAD_ALLOCATION", "FACULTY_DEVELOPMENT", "COMMITTEE", "CONSULTANCY", "EXEC_EDUCATION", "OUTSIDE_ENGAGEMENT", "FACULTY_SURVEY"], sarSections: ["WORKLOAD_POLICY"],
    purpose: "Workload allocation, development, committees, consultancy, executive education, outside engagement and turnover (Tables 4.2–4.8).",
    sources: ["nbeac", "facultyLoad"], checklist: ["The teaching-load policy is set", "Development activities for the year are recorded"], fields: [NOTE],
    pages: [{ href: "/accreditation/faculty", label: "Accreditation data: faculty" }] },
  { code: "5.1", group: "5", title: "Research output and funding", sarForm: "5", sarCodes: /^(Table 5\.\d+\w*|5\.\d+\w*)$/, suggested: [HOD, PL],
    sarKinds: ["RESEARCH_CENTER", "RESEARCH_GROUP", "RESEARCH_FUNDING", "RESEARCH_SPENDING", "FUNDED_PROJECT", "IMPACT_OUTPUT", "DISSEMINATION_FORUM", "THESIS_SUPERVISION"], sarSections: ["ORIC"],
    purpose: "Research centres and groups, funding and spending, funded projects, publications, impact and thesis supervision (Form 5).",
    sources: ["nbeac"], checklist: ["Publications are entered in the faculty profiles", "Research funding matches the finance records"], fields: [NOTE],
    pages: [{ href: "/accreditation/research", label: "Accreditation data: research" }] },
  { code: "6.1", group: "6", title: "Linkages, MOUs and the advisory board", sarForm: "6", sarCodes: /^(Table 6\.[3-5]\w*|6\.2b)$/, sarKinds: ["MOU", "EXCHANGE", "ADVISORY_MEMBER"], suggested: [HOD, DC],
    purpose: "MOUs, student and faculty exchanges and the corporate advisory board (Tables 6.3–6.5).",
    sources: ["nbeac", "industry"], checklist: ["MOUs are signed copies"], fields: [NOTE],
    pages: [{ href: "/accreditation/outreach", label: "Accreditation data: outreach" }] },
  { code: "6.2", group: "6", title: "Alumni, community and environment", sarForm: "6", sarCodes: /^Table 6\.[67]\w*$/, sarKinds: ["ALUMNI_ACTIVITY", "COMMUNITY_ACTIVITY", "ENVIRONMENT_INITIATIVE"], suggested: [SA, DC],
    purpose: "Alumni activities, community development and environmental initiatives (Tables 6.6–6.7).",
    sources: ["nbeac"], checklist: ["Activities for the year are recorded"], fields: [NOTE],
    pages: [{ href: "/accreditation/outreach", label: "Accreditation data: outreach" }] },
  { code: "7.1", group: "7", title: "Finance and budget", sarForm: "7", sarCodes: /^(Table 7\.[1-3]|7\.4a)$/, sarKinds: ["BUDGET_YEAR", "FINANCE_LINE", "FINANCIAL_RISK"], suggested: [FIN],
    purpose: "Three years of budget, revenue and expenses, and financial risk management (Tables 7.1–7.3).",
    sources: ["nbeac", "finance"], checklist: ["The figures match the audited accounts"], fields: [NOTE],
    pages: [{ href: "/accreditation/resources", label: "Accreditation data: resources" }, { href: "/chairman/finance", label: "Finance" }] },
  { code: "7.2", group: "7", title: "Facilities, library and IT", sarForm: "7", sarCodes: /^Table 7\.4$/, sarSections: ["FACILITY_DETAILS", "LIBRARY_DETAILS", "IT_DETAILS"], suggested: [FAC, LIB],
    purpose: "Table 7.4: premises, offices, lecture halls, library, IT and transport.",
    sources: ["nbeac", "facilities", "library"], checklist: ["Facility figures were counted this year"], fields: [NOTE],
    pages: [{ href: "/facilities", label: "Facilities" }, { href: "/library-inventory", label: "Library Inventory" }] },
  { code: "7.3", group: "7", title: "Support staff and employee welfare", sarForm: "7", sarCodes: /^Table 7\.[56]$/, sarKinds: ["SUPPORT_STAFF", "EMPLOYEE_BENEFIT"], suggested: [FAC, HOD],
    purpose: "Support staff by function and employee benefits (Tables 7.5–7.6).",
    sources: ["nbeac"], checklist: ["Staff numbers match the establishment"], fields: [NOTE],
    pages: [{ href: "/accreditation/resources", label: "Accreditation data: resources" }] },
  { code: "7.4", group: "7", title: "CQI and quality enhancement", suggested: [HOD, PL, OMC],
    purpose: "Findings, actions and their effect — the school's continuous improvement record.", sources: ["cqi"], checklist: ["Every open finding has an action"], fields: [NOTE],
    pages: [{ href: "/chairman/cqi", label: "CQI Records" }] },
];

// ---------------------------------------------------------------------------------------------------- HEC
const HEC_GROUPS: GroupDef[] = [
  { key: "1", title: "Program Mission, Objectives and Outcomes" }, { key: "2", title: "Curriculum Design and Organization" }, { key: "3", title: "Laboratories and Computing Facilities" },
  { key: "4", title: "Student Support and Advising" }, { key: "5", title: "Process Control" }, { key: "6", title: "Faculty" },
  { key: "7", title: "Institutional Facilities" }, { key: "8", title: "Institutional Support" },
];
const HEC_TASKS: TaskDef[] = [
  { code: "1.1", group: "1", title: "Mission, objectives and learning outcomes", evidenceCriterion: 1, suggested: [PL, DC],
    purpose: "The program's mission and objectives, and its PLOs approved and mapped to courses.", sources: ["plos", "meetings"],
    checklist: ["The mission and objectives match the approved Program Document"], fields: [NOTE], pages: [{ href: "/coordinator/program-profile", label: "Program Document" }, { href: "/coordinator/plos", label: "Program Learning Outcomes" }] },
  { code: "1.2", group: "1", title: "Outcome attainment and stakeholder surveys", suggested: [PL, OMC],
    purpose: "PLO attainment against the benchmark, and what students, alumni and employers said.", sources: ["ploAttainment", "surveys"],
    checklist: ["Attainment below the benchmark is explained"], fields: [NOTE], pages: [{ href: "/outcomes", label: "Graduation & Surveys" }] },
  { code: "2.1", group: "2", title: "Scheme of studies against the HEC curriculum", evidenceCriterion: 2, suggested: [PL],
    purpose: "Credit hours, semesters and coverage of the HEC curriculum for each batch.", sources: ["curriculum"],
    checklist: ["Differences from the HEC curriculum are explained"], fields: [NOTE], pages: [{ href: "/coordinator/hec-comparison", label: "Curriculum vs HEC" }] },
  { code: "2.2", group: "2", title: "Course file audit", suggested: [PL, INS, DC],
    purpose: "A complete folder for every offered course.", sources: ["courseFiles"], checklist: ["I have opened every course folder marked as kept"], fields: [NOTE],
    pages: [{ href: "/coordinator/course-folders", label: "Course Folders" }] },
  { code: "3.1", group: "3", title: "Laboratories and equipment", evidenceCriterion: 3, suggested: [LM, PL],
    purpose: "The labs the program uses, their equipment and its condition, against the students.", sources: ["lab"],
    checklist: ["The lab inventory was counted this semester"], fields: [NOTE], pages: [{ href: "/lab-inventory", label: "Lab Inventory" }] },
  { code: "4.1", group: "4", title: "Advising, counselling and class sizes", evidenceCriterion: 4, suggested: [PL, DC],
    purpose: "An advisor for every batch, counselling held and sections within the class-size limit.", sources: ["studentSupport"],
    checklist: ["Advisors are in post"], fields: [NOTE], pages: [{ href: "/coordinator/batches", label: "Degree Programs & Batches" }] },
  { code: "4.2", group: "4", title: "Admission, progression and graduation figures", suggested: [PL, SA],
    purpose: "Admitted, graduated, on-time and dropped-out students for each intake year.", sources: ["outcomes"],
    checklist: ["The figures match the admission office's records"], fields: [NOTE], pages: [{ href: "/outcomes", label: "Graduation & Surveys" }] },
  { code: "5.1", group: "5", title: "Assessment, results and CQI", evidenceCriterion: 5, suggested: [PL, OMC],
    purpose: "Results submitted and approved, and the improvement actions taken on review findings.", sources: ["results", "cqi"],
    checklist: ["Every open finding has an action"], fields: [NOTE], pages: [{ href: "/results-approval", label: "Result Approval" }, { href: "/chairman/cqi", label: "CQI Records" }] },
  { code: "5.2", group: "5", title: "Statutory approvals and meetings", suggested: [PL, HOD],
    purpose: "Board of Studies, Academic Council and faculty meetings with their decisions.", sources: ["meetings"],
    checklist: ["Minutes of the latest meetings are on file"], fields: [NOTE], pages: [{ href: "/meetings", label: "Meetings & Minutes" }] },
  { code: "6.1", group: "6", title: "Faculty qualification register", evidenceCriterion: 6, suggested: [HOD, PL],
    purpose: "Every teacher's qualification, designation and status, checked against the documents.", sources: ["faculty"],
    checklist: ["Every faculty profile has been checked against the degree documents"], fields: [NOTE], pages: [{ href: "/faculty-report", label: "Faculty Details Report" }] },
  { code: "6.2", group: "6", title: "Faculty load and development", suggested: [PL, HOD],
    purpose: "Teaching loads within the limit, training and research.", sources: ["facultyLoad"], checklist: ["Loads above the limit are explained"], fields: [NOTE],
    pages: [{ href: "/coordinator/load-report", label: "Teacher Load Report" }] },
  { code: "7.1", group: "7", title: "Library and textbooks", evidenceCriterion: 7, suggested: [LIB],
    purpose: "Library holdings, digital access and the textbooks ordered for the program.", sources: ["library"], checklist: ["Library figures were counted this year"], fields: [NOTE],
    pages: [{ href: "/library-inventory", label: "Library Inventory" }] },
  { code: "7.2", group: "7", title: "Classrooms and campus facilities", suggested: [FAC],
    purpose: "Lecture rooms, their capacity and the campus services the program uses.", sources: ["facilities"], checklist: ["Room figures are current"], fields: [NOTE],
    pages: [{ href: "/facilities", label: "Facilities" }] },
  { code: "8.1", group: "8", title: "Budget and institutional support", evidenceCriterion: 8, suggested: [FIN],
    purpose: "The budget for the program's people, labs, library and development.", sources: ["finance"], checklist: ["The figures match the approved budget"], fields: [NOTE],
    pages: [{ href: "/chairman/finance", label: "Finance" }] },
];

export const CATALOGUE: Record<BodyKey, { groups: GroupDef[]; tasks: TaskDef[] }> = {
  NCEAC: { groups: NCEAC_GROUPS, tasks: NCEAC_TASKS },
  NBEAC: { groups: NBEAC_GROUPS, tasks: NBEAC_TASKS },
  HEC: { groups: HEC_GROUPS, tasks: HEC_TASKS },
};
// The council comes from the database, so an unknown one finds nothing rather than throwing.
export const taskDef = (body: BodyKey | string, code: string) => CATALOGUE[body as BodyKey]?.tasks.find((t) => t.code === code) || null;
export const groupOf = (body: BodyKey | string, key: string) => CATALOGUE[body as BodyKey]?.groups.find((g) => g.key === key) || null;
/** The roles a task may be given to: Program Leads, teachers and the administrative staff. */
export const ASSIGNABLE_ROLES = [PL, DC, INS, SE, HOD, OMC, LIB, FIN, LM, FAC, SA, "LAB_ENGINEER"];
