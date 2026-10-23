// Every field of the NCEAC portal (AAS) forms and upload templates, from the portal's printouts of a submitted
// application (Request Form, POs, GAs, Curriculum, Students, Faculty, Facilities, Financial, Quality, Industrial
// Linkages, Addendum A and B), its faculty and course forms, and the two Excel upload templates.
// Each field is in one of three groups:
//   AUTO    — OBEHUB already holds it (source = table.field)
//   DERIVED — OBEHUB works it out (source = the formula)
//   INPUT   — people type it (source = where in OBEHUB)

export type Group = "AUTO" | "DERIVED" | "INPUT";
export type InvField = { form: string; field: string; type: string; allowed?: string; required: boolean; group: Group; source: string; href?: string };

const A = "AUTO", D = "DERIVED", I = "INPUT";
type Row = [field: string, type: string, required: boolean, group: Group, source: string, allowed?: string, href?: string];
const form = (name: string, rows: Row[]): InvField[] => rows.map(([field, type, required, group, source, allowed, href]) => ({ form: name, field, type, required, group, source, allowed, href }));

const STUDENT_SELF = "Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file";
const STAFF_SELF = "Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file";
const AAS = "NCEAC AAS page (workbook or typed)";
const SAR = "SAR sections (Accreditation → SAR), typed by the program team";

export const INVENTORY: InvField[] = [
  ...form("Students upload file (Template Current Students)", [
    ["Student Name", "Text", true, A, "Student.name"],
    ["FatherName", "Text", true, I, STUDENT_SELF, undefined, "/student/details"],
    ["Gender", "List", true, I, STUDENT_SELF, "M, F"],
    ["RollNo", "Text / number", true, A, "Student.rollNumber"],
    ["Admission Date", "Date (d-mmm-yyyy)", true, D, "First day of the batch's start term: Batch.startTerm + Batch.startYear (Fall → 1 Sep, Spring → 1 Feb)"],
    ["Nationality", "Text", true, I, `${STUDENT_SELF} (default Pakistani)`],
    ["CNIC Number", "Text xxxxx-xxxxxxx-x", true, I, STUDENT_SELF],
    ["Passport Number", "Text", false, I, `${STUDENT_SELF} (foreign students)`],
    ["Date of Birth", "Date (d-mmm-yyyy)", true, I, STUDENT_SELF],
    ["PhoneNumber", "Text, 03xxxxxxxxx", false, I, `${STUDENT_SELF}; else AdmissionLead.phone`],
    ["Email", "Email", false, I, `${STUDENT_SELF}; else AdmissionLead.email`],
    ["Domicile District", "Text", false, I, STUDENT_SELF],
    ["Domicile Province", "List", false, I, STUDENT_SELF, "Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan, Azad Jammu and Kashmir"],
    ["Mailing Address", "Text", true, I, STUDENT_SELF],
    ["City (Mailing Address)", "Text", true, I, `${STUDENT_SELF}; else AdmissionLead.city`],
    ["SSC Degree Name", "Text", false, I, STUDENT_SELF],
    ["SSC Board Name", "Text", false, I, STUDENT_SELF],
    ["SSC Total Marks", "Number", false, I, STUDENT_SELF],
    ["SSC Obtained Marks", "Number", false, I, STUDENT_SELF],
    ["HSSC Degree Name", "Text", true, I, STUDENT_SELF],
    ["HSSC Degree Nomenclature", "Number code", true, D, "From the student's track (Student.track): Pre-Medical → 3, A Level → 2, otherwise 1; the student or Program Lead can change it", "1 Intermediate With Math, 2 A Level With Math, 3 Intermediate With PreMedical"],
    ["HSSC Board Name", "Text", false, I, STUDENT_SELF],
    ["HSSC Total Marks", "Number", true, I, STUDENT_SELF],
    ["HSSC Obtained Marks", "Number", true, I, STUDENT_SELF],
  ]),
  ...form("Faculty upload file (Teacher Data)", [
    ["Email Address", "Email", true, A, "User.email (the teacher's institute account)"],
    ["Name", "Text", true, A, "User.name"],
    ["Gender", "List", true, A, "FacultyProfile.gender (or NCEAC details)", "Male, Female"],
    ["CNIC", "Text xxxxx-xxxxxxx-x (foreign: passport)", true, A, "FacultyProfile.cnic (or NCEAC details)"],
    ["Date of Birth", "Date", true, A, "FacultyProfile.dateOfBirth (or NCEAC details)"],
    ["Phone Number", "Text, 03xxxxxxxxx", true, A, "FacultyProfile.phone (or NCEAC details)"],
    ["Email", "Email", true, A, "User.email (or NCEAC details)"],
    ["Address", "Text", true, A, "FacultyProfile.address (or NCEAC details)"],
    ["Province", "List", true, I, STAFF_SELF, "Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan, Azad Jammu and Kashmir"],
    ["City", "Text", true, I, STAFF_SELF],
    ["Contract Type", "List", true, D, "FacultyProfile.employmentType mapped: Permanent / Contract / Regular → FullTime; Visiting / Part-time → Visiting; Shared → Shared", "FullTime, Visiting, Shared"],
    ["Academic Rank", "List", true, D, "FacultyProfile.designation mapped: e.g. Assistant Professor → AssistantProfessor, Lab Engineer → LabInstructor", "Professor, AssociateProfessor, AssistantProfessor, Lecturer, TeachingAssistant, LabAssistant, LabInstructor, PhDScholars"],
    ["Joining Date", "Date", true, A, "FacultyProfile.dateOfJoining"],
    ["Leaving Date", "Date", false, I, `${STAFF_SELF} (only for those who left)`],
    ["Degree Name", "Text", true, A, "FacultyRecord (kind EDUCATION, latest).title"],
    ["Degree Type", "List", true, D, "From the degree name: PhD; MS / MPhil; BS; Masters; Bachelors", "PhD, MS/MPhil, BS, Masters, Bachelors"],
    ["Field of Study", "Text", true, A, "FacultyProfile.specialization (or NCEAC details)"],
    ["Degree Awarded Country", "Text", true, I, `${STAFF_SELF} (default Pakistan)`],
    ["Degree Awarded Institute", "Text", true, A, "FacultyRecord (EDUCATION).organisation"],
    ["Degree Start Date", "Date", true, D, "FacultyRecord.startYear → 1 Sep of that year (estimate; the teacher confirms the exact date)"],
    ["Degree End Date", "Date", true, D, "FacultyRecord.endYear → 30 Jun of that year (estimate; the teacher confirms the exact date)"],
  ]),
  ...form("Faculty form on the portal (extra fields)", [
    ["Honorific", "List", true, I, STAFF_SELF, "Mr (others to confirm: Ms, Mrs, Dr, Prof, Engr)"],
    ["CNIC / Passport choice", "Choice", true, D, "Passport when Faculty Type is Foreign, otherwise CNIC"],
    ["Still working at Institute", "Tick", false, D, "Ticked when there is no Leaving Date"],
    ["Is Core Computing Teacher", "Tick", false, I, STAFF_SELF],
    ["Foreign University Name", "Text", false, I, `${STAFF_SELF} (when the degree is from abroad)`],
  ]),
  ...form("Courses Catalog (portal form, one course at a time)", [
    ["Course Name", "Text", true, A, "Course.code + Course.title"],
    ["HEC Curriculum", "List", true, I, `${AAS}: the HEC curriculum version the program follows`],
    ["Course Type", "List", true, D, "Course.courseType: Lab → Lab, everything else → Theory (theory and lab added separately)", "Theory, Lab"],
    ["Linked HEC Course", "List", true, D, "The HEC master-curriculum course the course was copied from (Master Curriculum); otherwise chosen on the portal"],
    ["Credit Hr", "Number", true, A, "Course.creditHours"],
    ["GA-1 … GA-10 mapping", "Ticks", false, A, "CoursePloMapping → PLO.number (PLO n = GA-n)"],
  ]),
  ...form("Request Form (Form for Accreditation Visit)", [
    ["Program and sessions under evaluation", "Text", true, A, "Batch.degreeProgram + Batch.batchName of the program's batches"],
    ["Name / Type of Institute, Degree Awarding Institution", "Text", true, I, AAS],
    ["Institute Address, City, Province, Contact No, Email, Website, Date of Establishment, Fax", "Text", true, I, `${AAS} — Institute's Profile`],
    ["Chief Administrator Officer: Name, Designation, Email", "Text", true, A, "Institute head's account (User) and position title (Admin → Organisation Chart)"],
    ["Dean: Name, Designation, Email", "Text", true, A, "The Dean's account and position title"],
    ["University Registrar: Name, Designation, Email", "Text", true, I, `${AAS} — Contact Information`],
    ["Head of Department: Name, Email", "Text", true, A, "The Head of Department's account (role HEAD_OF_DEPARTMENT of the program's department)"],
    ["Contact No and Fax of each contact", "Text", true, I, `${AAS} — Contact Information`],
    ["NCEAC Liaison: Name, Designation, Email, Mobile, Mailing Address, City, Province", "Text", true, A, "The NCEAC focal person chosen on the AAS page (User + FacultyProfile)"],
  ]),
  ...form("Program Objectives (POs) form", [
    ["Q1 Vision and mission", "Narrative", true, I, SAR],
    ["Q2 Formulation, improvement and approval of POs", "Narrative", true, I, SAR],
    ["Q3 Consistency of POs with vision and mission", "Narrative", true, I, SAR],
    ["Q4 Evaluating the achievement of POs", "Narrative", true, D, "Drafted from PEO/PO attainment (PEO Attainment page); the team edits it"],
    ["Q5 Using the evaluation results", "Narrative", true, I, SAR],
    ["PO table: PO No., Program Objective, Mapped GAs", "Table", true, A, "Program objectives (PEO) and their PLO mapping"],
  ]),
  ...form("Graduate Attributes (GAs) form", [
    ["Q1 Body that approved the GAs", "Text", true, I, SAR],
    ["Q2–Q3 How GAs meet the requirements; how they are reviewed", "Narrative", true, I, SAR],
    ["Q4 Data gathered and results of the GA assessment", "Table + narrative", true, D, "PLO (GA) attainment per batch: share of students at or above the PLO target (Outcomes Report)"],
    ["Q5 How results improve the program", "Narrative", true, D, "CQI actions recorded against PLOs (CqiRecord)"],
    ["Q6 Students' work and evidence of complex problems", "Narrative", true, I, SAR],
    ["Q7 Complex problems / activities in breadth and depth courses", "Table", true, I, `${SAR} (complex-problem tags, item 6)`],
  ]),
  ...form("Curriculum and Learning Process form", [
    ["Q1 Compliance with HEC curriculum (8 semesters, ≥ 130 credit hours)", "Narrative", true, D, "Σ Course.creditHours of the batch's scheme and number of semesters (Degree Scheme)"],
    ["Q2 Exposure to complex problems and design", "Narrative", true, I, SAR],
    ["Q3 Program-specific labs", "Narrative", true, D, "Labs (LabInfo) and lab courses of the program"],
    ["Q4 Lab work and its assessment", "Narrative", true, I, SAR],
    ["Q5 CLOs defined and mapped to GAs", "Yes/No + narrative", true, D, "Share of the program's courses with CLOs and a CLO→PLO mapping"],
    ["Q6 Industry involvement in curriculum", "Narrative", true, D, "Board of Studies minutes with external members (MeetingMinutes kind BOS)"],
    ["Q7 Tutorials, seminars, office hours", "Narrative", true, I, SAR],
    ["Q8 Internship with employer feedback", "Narrative", true, D, "Internship and employer survey records"],
    ["Q9 PBL, design projects, open-ended labs", "Narrative", true, I, SAR],
    ["Q10 Assessment of GAs / CLOs, direct and indirect", "Narrative", true, D, "Assessment instruments with CLO tags + surveys used (Assessment Rules, Surveys)"],
    ["Q11 FYDP includes complex problems", "Narrative", true, I, SAR],
    ["Q12 FYDP graded with rubrics", "Narrative", true, D, "FYP rubrics in use (FYP module)"],
  ]),
  ...form("Students form", [
    ["Q1 Admission requirements and annual intake", "Narrative", true, D, "Admission criteria (Admissions) + intake per year (students admitted per batch)"],
    ["Q2 Credit transfer / exemption policy", "Narrative", true, D, "Student status policy: minimum grade, maximum share of credits (Student Status Changes)"],
    ["Q3 Guidance: academic, career, wellness, discipline", "Narrative", true, D, "Batch advisors per batch + counselling records"],
    ["Q4 Harassment and plagiarism cases", "Narrative", true, I, SAR],
    ["Q5 Workload and class sizes (theory and lab)", "Narrative", true, D, "Registration rules (max credit hours) and average students per section"],
    ["Q6 Student societies and activities", "Narrative", true, D, "Societies and their events (Society Elections, Events)"],
    ["Q7 KPIs of students' performance against GAs", "Narrative", true, D, "PLO targets (individual and cohort) from Outcome settings"],
  ]),
  ...form("Faculty and Support Staff form", [
    ["Q1 Strength and competencies of the faculty", "Narrative", true, D, "Faculty by highest degree and specialisation (FacultyRecord, FacultyProfile)"],
    ["Q2 Workload: teaching, advising, research", "Narrative", true, D, "Teaching load per teacher per term (course allocation) and advising duties"],
    ["Q3 Faculty development and retention", "Narrative", true, D, "FDP sessions attended + retention (joining / leaving dates)"],
    ["Q4 Technical and administrative staff", "Narrative", true, I, SAR],
  ]),
  ...form("Facilities and Infrastructure form", [
    ["Q1–Q3 Lecture rooms: dedicated, shared, average size", "Number", true, A, "Room (type, departmentId, capacity)"],
    ["Q4–Q5 Facilities in lecture rooms, other facilities", "Text", true, I, `${AAS} — II Infrastructure`],
    ["Q6–Q8 Computing labs, computers per lab, PC lifetime", "Number", true, A, "LabInfo.computers / computersWorking; lifetime typed in AAS"],
    ["Q9 Lab contact hours per credit hour per week", "Number", true, D, "Lab courses' contact hours ÷ credit hours"],
    ["Q10–Q11 Networking; specialised labs and hours", "Text", true, I, `${AAS} — II Infrastructure`],
    ["Q12–Q13 Logic design lab; exclusive final-year lab", "Yes/No", true, I, `${AAS} — II Infrastructure`],
    ["Q14–Q16 Student to computer ratio (3 years)", "Number", true, D, "Active students ÷ working computers in labs"],
    ["Q17–Q18 Books and unique titles in the library", "Number", true, A, "LibraryInfo.totalVolumes, computingTitles"],
    ["Q19–Q21 HEC digital library; library system; IEEE/ACM access", "Yes/No", true, A, "LibraryInfo.databases"],
    ["Q22–Q27 Computing books added and technical magazines (3 years)", "Number", true, I, `${AAS} — II Infrastructure`],
    ["Q28 Separate faculty offices", "Number", true, I, `${AAS} — III General Information`],
    ["Q29–Q40 Yes/No questions (TA support, BoS meetings, calendar, Wi-Fi, sports, hostel, prayer area, common room, societies, placement office)", "Yes/No", true, I, `${AAS} — III General Information (BoS meetings and placement office filled from records)`],
    ["Q41–Q43 Own or rented building; purpose built; sub-campuses", "Text", true, I, `${AAS} — III General Information`],
    ["Q44 Recent and planned improvements", "Narrative", true, I, SAR],
  ]),
  ...form("Institutional Support and Financial Resources form", [
    ["Annual expenditure of the institution (5 years)", "Number (PKR millions)", true, A, "FinanceEntry (kind SPENT) summed per fiscal year"],
    ["Research and faculty development (institution, computing department)", "Number", true, A, "FinanceEntry categories research / development / training"],
    ["Library and computing books", "Number", true, A, "FinanceEntry categories library / books"],
    ["Computing facilities; computing department total", "Number", true, I, `${AAS} — IV Financial Information`],
  ]),
  ...form("Steps to Improve Quality form", [
    ["Q1–Q3 Program planning; curriculum development; content review", "Narrative", true, D, "Board of Studies decisions and curriculum versions (policy history)"],
    ["Q4 Responding to stakeholder feedback", "Narrative", true, D, "Survey results and the CQI actions taken on them"],
    ["Q5 Tracking each course's contribution to GAs", "Narrative", true, A, "CLO→PLO mapping and course PLO attainment"],
    ["Q6 Tracking performance through assessment and rubrics", "Narrative", true, D, "Rubric-based assessments and attainment reports"],
    ["Q7 Implementation plan from the last visit", "Narrative", true, D, "Accreditation tasks and their status (Accreditation → Tasks)"],
    ["Q8–Q10 Participation in quality work; staff development; QA policies", "Narrative", true, I, SAR],
  ]),
  ...form("Industrial Linkages form", [
    ["Q1 Industry advisory board and its role", "Narrative", true, I, SAR],
    ["Q2 Collaborative projects and internships", "Narrative", true, D, "Internships and industry projects recorded"],
    ["Q3 Policies for industry-sponsored projects", "Narrative", true, I, SAR],
  ]),
  ...form("Addendum A (offered courses per session)", [
    ["Course name and mapped GAs", "Text", true, A, "Course.code + title; CoursePloMapping → GA-n"],
    ["Semester number", "Number", true, A, "Course.semesterNumber"],
    ["Sections", "Number", true, A, "CourseSectionAssignment.sectionCount / ScheduleSection count"],
    ["Students", "Number", true, A, "StudentEnrollment count per course"],
    ["Teaching faculty", "Text", true, A, "Course.instructor (and section instructors)"],
  ]),
  ...form("Addendum B (faculty teaching elsewhere)", [
    ["Name", "Text", true, A, "User.name of the program's teachers"],
    ["MS course load", "Number", true, D, "Courses the teacher teaches in MS programs in the session"],
    ["PhD course load", "Number", true, D, "Courses the teacher teaches in PhD programs in the session"],
    ["Other department", "Number", true, D, "Courses the teacher teaches for other departments in the session"],
  ]),
];

export const GROUP_LABEL: Record<Group, string> = { AUTO: "Auto — OBEHUB already holds it", DERIVED: "Derived — OBEHUB works it out", INPUT: "Input needed" };
