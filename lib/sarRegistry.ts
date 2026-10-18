// What the NBEAC Self-Assessment Report (SAR v4.0) asks for that the rest of the system does not already keep, defined
// once: the profile sections (one form each, for the institute or for a business school) and the record kinds (a
// register each). The accreditation pages, their API and the SAR builder are all driven from these definitions.

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
export type Field = { key: string; label: string; type?: FieldType; options?: string[]; required?: boolean; width?: number; hint?: string };
export type AreaKey = "governance" | "policies" | "curriculum" | "students" | "faculty" | "research" | "outreach" | "resources" | "cases";

const MANAGERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
const ACADEMIC = [...MANAGERS, "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const FACULTY = ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "OMC", "LAB_ENGINEER"];
/** Roles that can look at the (non-confidential) accreditation records of their area of the institute. */
export const VIEW_ROLES = [...ACADEMIC, "FINANCE_OFFICER", "FACILITIES_MANAGER", "STUDENT_AFFAIRS", "LIBRARIAN", "OMC"];

export type AreaDef = { key: AreaKey; label: string; form: string; blurb: string };
export const AREAS: AreaDef[] = [
  { key: "governance", label: "Institute & governance", form: "Form 1", blurb: "Institute and business-school information, contacts, vision and mission approvals, strategic plans, statutory bodies, QA reviews, QEC and external audits." },
  { key: "policies", label: "Policies & manuals", form: "All forms", blurb: "Every approved policy, rules and manual the SAR asks to attach, with its approving body and approval / review dates." },
  { key: "curriculum", label: "Curriculum records", form: "Form 2", blurb: "Curriculum reviews and indigenous teaching materials. Program approvals, the PEO-GA map and course details are kept on the program and course pages." },
  { key: "students", label: "Admissions & student support", form: "Form 3", blurb: "Applications and admissions per intake, selection tools, counselling, internships and placement activities." },
  { key: "faculty", label: "Faculty activities", form: "Form 4", blurb: "Teaching-load policy, workload time allocation, development activities, committees, consultancy, executive education, outside engagement, satisfaction surveys and exits." },
  { key: "research", label: "Research & ORIC", form: "Form 5", blurb: "ORIC, research centres and groups, research funding and spending, funded projects, impact of research, forums organised and thesis supervision." },
  { key: "outreach", label: "Linkages & outreach", form: "Form 6", blurb: "MOUs, student and faculty exchanges, the corporate advisory board, alumni activities, community service and environmental initiatives." },
  { key: "resources", label: "Finance & resources", form: "Form 7", blurb: "Budgets, the business school's revenue and expenses, financial risks, facility and library details, support staff and employee benefits." },
  { key: "cases", label: "Cases (confidential)", form: "Forms 2, 3, 5, 7", blurb: "Grievances, unfair means, plagiarism, misconduct and harassment cases. Only the Institute Head, Dean and department Chairman (and Student Affairs for student cases) can see them." },
];

// ---------------------------------------------------------------------------
// Profile sections (one JSON document per scope: "HEI" or a department id)

export type SectionDef = { key: string; area: AreaKey; label: string; sar: string; scope: "HEI" | "SCHOOL"; editors: string[]; fields: Field[] };
const yesNo = (key: string, label: string): Field => ({ key, label, type: "checkbox" });
const num = (key: string, label: string, width = 110): Field => ({ key, label, type: "number", width });

export const SECTIONS: SectionDef[] = [
  { key: "HEI", area: "governance", label: "Higher Education Institution", sar: "Table A, Table 1.1", scope: "HEI", editors: ["CHAIRMAN"], fields: [
    { key: "heiName", label: "Name of the HEI", width: 300 },
    { key: "heiType", label: "HEI type", type: "select", options: ["University", "Degree Awarding Institute"] },
    { key: "actRef", label: "Reference no. and date of Act / Ordinance / Charter", width: 300 },
    { key: "charterType", label: "Charter type", type: "select", options: ["Federal", "Azad Jammu Kashmir", "Balochistan", "Gilgit Baltistan", "Khyber Pakhtunkhwa", "Punjab", "Sindh"] },
    { key: "sector", label: "Sector", type: "select", options: ["Public", "Private"] },
    { key: "profitStatus", label: "Profit status", type: "select", options: ["Not for profit", "For profit"] },
    { key: "caoTitle", label: "Chief administrative officer", type: "select", options: ["Rector", "Vice Chancellor", "Director", "Other"] },
    { key: "caoName", label: "Name of the chief administrative officer", width: 260 },
    num("campuses", "Other campuses"), { key: "campusLocations", label: "Locations of other campuses", width: 300 },
    { key: "vision", label: "Vision of the HEI", type: "textarea" }, { key: "mission", label: "Mission of the HEI", type: "textarea" },
    { key: "vmAuthority", label: "Vision & mission approved by", width: 220 }, { key: "vmDate", label: "Approval date", type: "date" },
  ] },
  { key: "SCHOOL", area: "governance", label: "Business school", sar: "Table A, Table 1.1", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], fields: [
    { key: "title", label: "Title of the business school", width: 300 }, num("yearEstablished", "Year of establishment"),
    { key: "address", label: "Address", width: 360 }, { key: "website", label: "Website URL", width: 240 },
    { key: "hierarchy", label: "Hierarchical context", type: "select", options: ["Constituent part", "Affiliated"] },
    { key: "vision", label: "Vision of the business school", type: "textarea", hint: "Left blank, the department vision from the Program Profile is used." },
    { key: "mission", label: "Mission of the business school", type: "textarea" },
    { key: "vmAuthority", label: "Vision & mission approved by", width: 220 }, { key: "vmDate", label: "Approval date", type: "date" },
  ] },
  { key: "CONTACTS", area: "governance", label: "Contacts for NBEAC", sar: "Table C", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], fields: [
    ...["dean", "head", "focal"].flatMap((p) => {
      const who = p === "dean" ? "Dean" : p === "head" ? "Head of business school" : "Focal person for NBEAC";
      return [{ key: `${p}Name`, label: `${who}: name`, width: 220 }, { key: `${p}Designation`, label: "Designation", width: 180 }, { key: `${p}TelOff`, label: "Tel (office)", width: 140 }, { key: `${p}TelCell`, label: "Tel (cell)", width: 140 }, { key: `${p}Email`, label: "Email", width: 220 }] as Field[];
    }),
  ] },
  { key: "QEC", area: "governance", label: "Quality Enhancement Cell", sar: "Table 1.8", scope: "HEI", editors: ["CHAIRMAN"], fields: [
    { key: "established", label: "Date of establishment", type: "date" }, num("staff", "Number of staff"),
    { key: "headQualification", label: "Qualification of the QEC head", width: 260 },
    { key: "category", label: "QAA-HEC category", type: "select", options: ["W", "X", "Y", "Not categorised"] },
  ] },
  { key: "WORKLOAD_POLICY", area: "faculty", label: "Teaching-load policy (for FTE)", sar: "Tables 4.1d–4.1f", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], fields: [
    num("Professor", "Professor: max credit hours / semester"), num("Associate Professor", "Associate Professor"), num("Assistant Professor", "Assistant Professor"),
    num("Lecturer", "Lecturer"), num("Visiting", "Visiting / adjunct faculty"), num("Default", "Anyone else"),
  ] },
  { key: "ORIC", area: "research", label: "ORIC", sar: "Table 5.1", scope: "HEI", editors: ["CHAIRMAN"], fields: [
    { key: "established", label: "Date of establishment", type: "date" }, { key: "hecRecognition", label: "Date of HEC recognition", type: "date" },
    { key: "head", label: "Head of ORIC", width: 220 }, { key: "reportsTo", label: "Head of ORIC reports to", width: 220 }, { key: "ranking", label: "ORIC ranking (if HEC-recognised)", width: 180 },
  ] },
  { key: "FACILITY_DETAILS", area: "resources", label: "Facility details", sar: "Table 7.4", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "FACILITIES_MANAGER"], fields: [
    num("officesOne", "Offices with one faculty member"), num("officesTwo", "Offices with two"), num("officesMore", "Offices with more than two"),
    yesNo("officeAc", "Offices: air conditioning / heating"), yesNo("officeCabinets", "Offices: safe cabinets"), yesNo("officeComputers", "Offices: individual desktops / laptops"),
    { key: "printers", label: "Printers (individual, or shared among how many?)", width: 280 },
    num("hallsDedicated", "Lecture halls dedicated to the business school"), num("hallsShared", "Lecture halls used on a shared basis"),
    yesNo("hallSmartboards", "Halls: smartboards"), yesNo("hallWhiteboards", "Halls: whiteboard / blackboard"), yesNo("hallMultimedia", "Halls: multimedia"),
    yesNo("hallAudioVisual", "Halls: audiovisuals"), yesNo("hallLighting", "Halls: proper lighting"), yesNo("hallAc", "Halls: air conditioning / heating"),
    { key: "studySpaces", label: "Study spaces / breakout rooms (number and seats)", width: 280 },
    num("admissionsSeats", "Admissions office: seats"), num("admissionsComputers", "Admissions office: computers"), { key: "admissionsSoftware", label: "Admissions office: software", width: 200 },
    num("examSeats", "Examination office: seats"), num("examComputers", "Examination office: computers"), { key: "examSoftware", label: "Examination office: software", width: 200 },
    num("examPhotocopiers", "Examination office: photocopiers"), yesNo("examStrongRoom", "Examination office: strong room"),
    num("vansFaculty", "Vans for faculty"), num("vansStudents", "Vans for students"),
    yesNo("femaleCommonRoom", "Female students' common room"), yesNo("maleCommonRoom", "Male students' lounge / common room"),
    { key: "facultyHostels", label: "Faculty hostels (number and capacity)", width: 220 }, { key: "femaleHostels", label: "Female student hostels (number and capacity)", width: 240 }, { key: "maleHostels", label: "Male student hostels (number and capacity)", width: 240 },
  ] },
  { key: "LIBRARY_DETAILS", area: "resources", label: "Library details (business-school subjects)", sar: "Table 7.4", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "LIBRARIAN"], fields: [
    num("libraries", "Number of libraries"), num("textbooks", "Management-science textbooks (hard copy)"), num("referenceBooks", "Management-science reference books"),
    num("localJournals", "Local journal subscriptions"), num("intlJournals", "International journal subscriptions"), num("magazines", "Magazines"), num("ebooks", "E-books"),
    num("budgetAllocated", "Budget for new books & journals this year (PKR)", 150), num("budgetSpent", "Budget spent this year (PKR)", 150), num("newItems", "New books / subscriptions added this year"),
    yesNo("hecDigitalLibrary", "Access to the HEC digital library"), yesNo("offCampusAccess", "Off-campus access to digital libraries"), { key: "otherDigitalLibraries", label: "Other digital libraries", width: 300 },
  ] },
  { key: "IT_DETAILS", area: "resources", label: "IT and teaching equipment", sar: "Table 7.4", scope: "SCHOOL", editors: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "FACILITIES_MANAGER"], fields: [
    { key: "network", label: "LAN / WAN networking", width: 220 }, { key: "bandwidth", label: "Internet bandwidth", width: 140 }, { key: "wanAreas", label: "Areas with Wi-Fi / WAN", width: 260 },
    yesNo("lms", "Learning Management System (LMS)"), yesNo("cms", "Campus Management System (CMS)"), yesNo("backup", "Data backup servers"),
    yesNo("smartboards", "Interactive whiteboards / smartboards"), yesNo("documentCameras", "Document cameras"), yesNo("webcams", "Webcams"),
    yesNo("audio", "Microphones and speakers"), yesNo("tablets", "Graphical tablets"), yesNo("videoConferencing", "Video-conferencing tools"),
  ] },
];
export const sectionDef = (key: string) => SECTIONS.find((s) => s.key === key) || null;

// ---------------------------------------------------------------------------
// Record kinds (one register each)

export type KindDef = {
  kind: string; area: AreaKey; label: string; sar: string; titleLabel: string; titleOptions?: string[];
  dateLabel?: string; yearLabel?: string; fields: Field[]; file?: boolean; confidential?: boolean;
  editors: string[]; selfService?: string[]; hint?: string;
};
const sem = "Semester (e.g. Fall 2025)", yr = "Year (e.g. 2025 or 2025-26)";
const BODIES = ["Senate", "Syndicate / Board of Governors", "Academic Council", "Board of Faculty", "Board of Studies", "Selection Board", "BASR", "Finance & Planning Committee", "Other"];
export const APPENDICES = [
  "1A Vision & mission approval", "1B Strategic plan", "1C Strategic plan progress report", "1D Rules of business for statutory bodies", "1E Organograms", "1F Financial audit report",
  "2A Academic Council approval of programs", "2B HEC NOC", "2C Course outlines", "2D Curriculum update policy", "2E Semester management rules", "2F Sample course file",
  "2G Assessment & grading policy", "2H Paper & result moderation policy", "2I Examination rules", "2J Unfair means policy",
  "3A Admission policy", "3B Student progression policy", "3C Support for weak students policy", "3D Student counselling policy", "3E Societies & clubs rules",
  "3F Internship & placement policy", "3G Student grievance policy", "3H Scholarships & financial assistance policy",
  "4A Faculty workload policy", "4B Faculty hiring policy", "4C Last faculty hiring record", "4D Faculty performance management policy", "4E Performance appraisal instrument",
  "4F Student feedback questionnaire", "4G Faculty development policy", "4H Faculty consultancy policy", "4I Executive education policy", "4J Engagement with outside organisations policy",
  "4K Faculty satisfaction survey questionnaire", "4L Faculty exit interview questionnaire",
  "5A Research & development policy", "5B ORIC scorecards", "5C Publications list (APA)", "5D Anti-plagiarism policy", "5E Thesis / project rules",
  "6A External linkages policy", "6B Alumni association charter", "6C Community development & social service policy", "6D Environmental protection policy",
  "7A Finance manual", "7B Admin manual", "7C Codes of ethics for employees and students", "7D Sexual harassment policy", "Other",
];
export const FINANCE_PARTICULARS = [
  "Revenue: Undergraduate programs fee", "Revenue: Graduate programs fee", "Revenue: Postgraduate programs fee", "Revenue: Executive education fee", "Revenue: Funded research projects",
  "Revenue: Consulting income", "Revenue: Intellectual property rights", "Revenue: Corporate sponsors", "Revenue: Endowment fund / investment income", "Revenue: Government grants",
  "Revenue: Grants by parent organisation", "Revenue: Others",
  "Expense: Faculty salaries", "Expense: Staff salaries", "Expense: Scholarships / financial assistance", "Expense: IT facilities", "Expense: Library", "Expense: R&D",
  "Expense: Faculty development", "Expense: Staff development", "Expense: Co- & extracurricular activities", "Expense: Educational visits / seminars",
  "Expense: Social responsibility & environmental protection", "Expense: Marketing and promotion", "Expense: Repair and maintenance", "Expense: Interest payments", "Expense: Utilities", "Expense: Others",
];
const CASE_EDITORS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];

export const KINDS: KindDef[] = [
  // Form 1
  { kind: "STRATEGIC_PLAN", area: "governance", label: "Strategic plans", sar: "Table 1.2, Appendix 1B–1C", titleLabel: "Strategic plan (e.g. Strategic Plan 2024–2028)", dateLabel: "Date of approval", file: true, editors: MANAGERS, fields: [
    { key: "status", label: "Plan", type: "select", options: ["Current", "Previous"], required: true }, { key: "period", label: "Plan period", width: 140 },
    { key: "authority", label: "Approving authority", width: 200 }, { key: "reviewedOn", label: "Updated / reviewed on", type: "date" }, { key: "progressTill", label: "Progress report documented till", type: "date" } ] },
  { kind: "STATUTORY_BODY", area: "governance", label: "Statutory bodies — composition", sar: "Table 1.3a", titleLabel: "Statutory body", titleOptions: BODIES, editors: MANAGERS, fields: [
    { key: "chair", label: "Chairperson (name & designation)", width: 260 }, { key: "exOfficio", label: "Designations of ex-officio members", type: "textarea" }, { key: "appointed", label: "Names and designations of appointed members", type: "textarea" } ] },
  { kind: "BODY_MEMBER", area: "governance", label: "Statutory body members (external and faculty)", sar: "Tables 1.3b, 4.4a", titleLabel: "Member's name", dateLabel: "Date of notification (appointed members)", editors: MANAGERS, fields: [
    { key: "body", label: "Statutory body", type: "select", options: BODIES, required: true },
    { key: "memberType", label: "Member", type: "select", options: ["External participant", "Faculty (member by designation)", "Faculty (appointed)"], required: true },
    { key: "designation", label: "Designation & affiliation", width: 260 }, { key: "reach", label: "National / international", type: "select", options: ["National", "International"] },
    { key: "meetings", label: "Meetings attended (number and date)", width: 240 } ] },
  { kind: "QA_REVIEW", area: "governance", label: "Quality assurance reviews", sar: "Table 1.7", titleLabel: "Program (or the institution for IPE)", file: true, editors: MANAGERS, fields: [
    { key: "model", label: "QA model", type: "select", options: ["PREE / SAR", "PGPR", "IPE / RIPE"], required: true },
    { key: "externalOn", label: "Last external review held on", type: "date" }, { key: "internalOn", label: "Last internal review (self review) held on", type: "date" }, { key: "plan", label: "Corrective action plan / progress", width: 300 } ] },
  { kind: "AUDIT", area: "governance", label: "External audits", sar: "Table 1.9, Appendix 1F", titleLabel: "Auditing firm / AGPR", yearLabel: "Year audited", file: true, editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    { key: "sbpCategory", label: "SBP category (if a firm)", width: 140 }, { key: "observations", label: "Salient audit observations", type: "textarea" }, { key: "measures", label: "Corrective measures", type: "textarea" } ] },
  // All forms
  { kind: "POLICY", area: "policies", label: "Policies, rules and manuals", sar: "Table 1.5 and the SAR appendices", titleLabel: "Title", dateLabel: "Approval date", file: true, editors: [...ACADEMIC, "FINANCE_OFFICER", "FACILITIES_MANAGER", "STUDENT_AFFAIRS"], fields: [
    { key: "appendix", label: "SAR appendix it answers", type: "select", options: APPENDICES, required: true, width: 300 },
    { key: "category", label: "Kind", type: "select", options: ["Academic", "HR", "Finance", "Administration", "Students", "Research", "Quality", "Other"] },
    { key: "approvedBy", label: "Approving body", width: 220 }, { key: "reviewDate", label: "Review date", type: "date" }, { key: "communicated", label: "How it is communicated", width: 280 } ] },
  // Form 2
  { kind: "CURRICULUM_REVIEW", area: "curriculum", label: "Curriculum reviews", sar: "Table 2.10", titleLabel: "Program", dateLabel: "Review date", file: true, editors: ACADEMIC, fields: [
    { key: "type", label: "Review", type: "select", options: ["Partial", "Major"], required: true }, { key: "number", label: "Review number", width: 100 },
    { key: "participants", label: "Review participants", type: "textarea" }, { key: "details", label: "Review details", type: "textarea" }, { key: "approvedBy", label: "Approved by", width: 220 } ] },
  { kind: "INDIGENOUS_MATERIAL", area: "curriculum", label: "Indigenous teaching materials", sar: "Table 2.6b", titleLabel: "Material (APA reference)", editors: ACADEMIC, selfService: FACULTY, fields: [
    { key: "nature", label: "Nature", type: "select", options: ["Case study", "Published research", "Book chapter", "Book", "Video", "Other"] },
    { key: "course", label: "Course(s) it is used in", width: 240 }, { key: "contribution", label: "Contribution", type: "textarea" } ] },
  // Form 3
  { kind: "ADMISSION_STATS", area: "students", label: "Applications and admissions", sar: "Table 3.3", titleLabel: "Program", yearLabel: "Year", editors: ACADEMIC, fields: [
    { key: "semester", label: "Semester", type: "select", options: ["Fall", "Spring"], required: true }, num("applications", "Applications received"),
    num("passedTest", "Passed the admission test"), num("offered", "Admissions offered"), num("enrolled", "Students enrolled") ] },
  { kind: "SELECTION_TOOL", area: "students", label: "Selection tools", sar: "Table 3.4", titleLabel: "Program", editors: ACADEMIC, fields: [
    { key: "tool", label: "Selection tool (e.g. admission test, interview, academic record)", width: 320, required: true }, num("weightage", "Weightage %") ] },
  { kind: "COUNSELING", area: "students", label: "Academic and non-academic counselling", sar: "Table 3.7a", titleLabel: "Counsellor", yearLabel: sem, editors: [...ACADEMIC, "STUDENT_AFFAIRS"], fields: [
    { key: "frequency", label: "Frequency of sessions", width: 160 }, num("students", "Students counselled"), { key: "topics", label: "Counselling mostly sought on", width: 280 } ] },
  { kind: "PSYCH_COUNSELING", area: "students", label: "Counselling by a professional psychologist", sar: "Table 3.7b", titleLabel: "Psychologist", yearLabel: sem, editors: [...MANAGERS, "STUDENT_AFFAIRS"], fields: [
    { key: "employment", label: "Full-time / part-time", type: "select", options: ["Full-time", "Part-time"] }, num("direct", "Cases accessed directly"),
    num("referred", "Cases referred by faculty / management"), { key: "topics", label: "Counselling mostly sought on", width: 280 } ] },
  { kind: "INTERNSHIP_STATS", area: "students", label: "Internships", sar: "Table 3.9", titleLabel: "Program", yearLabel: "Year", editors: [...ACADEMIC, "STUDENT_AFFAIRS"], fields: [
    num("eligible", "Students eligible"), num("got", "Students who got internships"), num("arranged", "Internships arranged by the business school") ] },
  { kind: "PLACEMENT_ACTIVITY", area: "students", label: "Placement activities", sar: "Table 3.10", titleLabel: "Placement activity", dateLabel: "Date", editors: [...ACADEMIC, "STUDENT_AFFAIRS"], fields: [
    { key: "program", label: "Program", width: 200 }, num("students", "Students exposed to placement opportunities") ] },
  // Form 4
  { kind: "WORKLOAD_ALLOCATION", area: "faculty", label: "Workload time allocation", sar: "Table 4.2a", titleLabel: "Faculty member", yearLabel: sem, editors: MANAGERS, fields: [
    { key: "designation", label: "Designation", width: 160 }, num("teaching", "Hours / week: teaching"), num("research", "Research"), num("service", "Institutional / outside services"), num("managerial", "Managerial responsibilities") ] },
  { kind: "FACULTY_DEVELOPMENT", area: "faculty", label: "Faculty development activities", sar: "Table 4.3b", titleLabel: "Development activity", dateLabel: "Date", file: true, editors: [...MANAGERS, "DEPARTMENT_COORDINATOR"], fields: [
    { key: "mode", label: "On / off the job", type: "select", options: ["On-the-job", "Off-the-job"] }, { key: "where", label: "If off the job", type: "select", options: ["Internal", "External", "International"] },
    { key: "venue", label: "Venue (if external / international)", width: 220 }, num("attendees", "Faculty attended"), { key: "names", label: "Names of faculty who attended", type: "textarea" } ] },
  { kind: "COMMITTEE", area: "faculty", label: "Internal committees", sar: "Table 4.4b", titleLabel: "Committee title & purpose", yearLabel: sem, file: true, editors: [...MANAGERS, "DEPARTMENT_COORDINATOR"], fields: [
    { key: "composition", label: "Composition", type: "textarea" }, { key: "meetings", label: "Meeting dates", width: 260 } ] },
  { kind: "CONSULTANCY", area: "faculty", label: "Consultancy projects", sar: "Table 4.5", titleLabel: "Consultancy project", editors: MANAGERS, selfService: FACULTY, fields: [
    { key: "client", label: "Client agency", width: 220 }, { key: "start", label: "Start date", type: "date" }, { key: "end", label: "End date", type: "date" },
    { key: "consultant", label: "Principal consultant", width: 200 }, num("amount", "Funding amount (PKR)", 140), { key: "share", label: "Business school – consultant share", width: 200 } ] },
  { kind: "EXEC_EDUCATION", area: "faculty", label: "Executive education", sar: "Table 4.6", titleLabel: "Executive education activity", yearLabel: sem, dateLabel: "Date", editors: MANAGERS, selfService: FACULTY, fields: [
    { key: "venue", label: "Held", type: "select", options: ["On campus", "In-house (at the client)"] }, { key: "faculty", label: "Conducting faculty", width: 220 },
    { key: "participants", label: "Kind and number of participants", width: 240 }, num("revenue", "Revenue earned (PKR)", 140) ] },
  { kind: "OUTSIDE_ENGAGEMENT", area: "faculty", label: "Engagement with outside organisations", sar: "Table 4.7", titleLabel: "Faculty name & title", yearLabel: "Year", editors: MANAGERS, selfService: FACULTY, fields: [
    { key: "organization", label: "Outside organisation", width: 240 }, { key: "type", label: "Type of engagement", type: "select", options: ["Statutory body member", "Editorial board", "Advisor", "Professional body", "Pro bono / social", "Other"] },
    { key: "lastActivity", label: "Title of the last activity", width: 240 }, { key: "lastDate", label: "Date of the last activity", type: "date" } ] },
  { kind: "FACULTY_SURVEY", area: "faculty", label: "Faculty satisfaction surveys", sar: "Q 4.10a, Appendix 4K", titleLabel: "Survey", yearLabel: sem, file: true, editors: MANAGERS, fields: [
    num("respondents", "Respondents"), num("score", "Overall satisfaction (out of 5)"), { key: "observations", label: "Main observations", type: "textarea" }, { key: "actions", label: "Actions taken", type: "textarea" } ] },
  { kind: "FACULTY_EXIT", area: "faculty", label: "Faculty exits and exit interviews", sar: "Table 4.8, Q 4.10b", titleLabel: "Faculty member", dateLabel: "Leaving date", confidential: true, editors: MANAGERS, fields: [
    { key: "reason", label: "Reason", type: "select", options: ["Resigned", "Terminated", "Retired", "Contract ended", "Other"], required: true },
    { key: "interviewed", label: "Exit interview held", type: "checkbox" }, { key: "observations", label: "Exit interview observations", type: "textarea" }, { key: "actions", label: "Actions taken", type: "textarea" } ] },
  // Form 5
  { kind: "RESEARCH_CENTER", area: "research", label: "Research centres", sar: "Table 5.2", titleLabel: "Research centre / committee", editors: MANAGERS, fields: [
    num("year", "Year of establishment"), { key: "position", label: "Hierarchical position", type: "select", options: ["Under the ORIC", "Dedicated to the business school"] },
    { key: "head", label: "Head", width: 200 }, { key: "reportsTo", label: "Head reports to", width: 200 }, { key: "contribution", label: "Contribution to research output", type: "textarea" } ] },
  { kind: "RESEARCH_GROUP", area: "research", label: "Special-interest research groups", sar: "Table 5.3", titleLabel: "Research group", editors: MANAGERS, fields: [
    { key: "members", label: "Members", type: "textarea" }, { key: "output", label: "Published research output", type: "textarea" } ] },
  { kind: "RESEARCH_FUNDING", area: "research", label: "Research funding", sar: "Table 5.4a", titleLabel: "Note (e.g. budget head or grant)", yearLabel: "Year", editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    { key: "source", label: "Source", type: "select", options: ["HEI / business school R&D budget", "Government research grants", "Industry research funding", "Others"], required: true }, num("amount", "Amount (PKR)", 140) ] },
  { kind: "RESEARCH_SPENDING", area: "research", label: "Research spending", sar: "Table 5.4b", titleLabel: "Spending heading (incentives, travel grants, start-ups, …)", yearLabel: "Year", editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    num("amount", "Funds spent (PKR)", 140), num("faculty", "Faculty benefited") ] },
  { kind: "FUNDED_PROJECT", area: "research", label: "Funded research projects", sar: "Table 5.5", titleLabel: "Research project", editors: MANAGERS, selfService: FACULTY, fields: [
    { key: "agency", label: "Funding agency", width: 220 }, { key: "start", label: "Start date", type: "date" }, { key: "end", label: "End date", type: "date" },
    { key: "pi", label: "Principal investigator", width: 200 }, num("amount", "Funding amount (PKR)", 140), { key: "share", label: "Business school – investigator share", width: 200 } ] },
  { kind: "IMPACT_OUTPUT", area: "research", label: "Research with societal, industrial or curricular impact", sar: "Tables 5.8, 5.9", titleLabel: "Research output (APA reference)", editors: MANAGERS, selfService: FACULTY, fields: [
    { key: "type", label: "Type of output", type: "select", options: ["Journal article", "Case study", "Book chapter", "Book", "Conference paper", "Report", "Other"] },
    { key: "impact", label: "Impact", type: "select", options: ["Societal", "Industrial", "Curricular"], required: true },
    { key: "curricular", label: "If curricular", type: "select", options: ["Became teaching material in courses", "A new course was inducted", "The program design was reviewed", "A new program was launched"] },
    { key: "description", label: "Impact (brief and specific)", type: "textarea" } ] },
  { kind: "DISSEMINATION_FORUM", area: "research", label: "Conferences, seminars and symposiums organised", sar: "Table 5.11", titleLabel: "Conference / seminar / symposium", dateLabel: "Date", editors: [...MANAGERS, "DEPARTMENT_COORDINATOR"], fields: [
    { key: "theme", label: "Theme", width: 240 }, num("speakers", "Number of speakers"), { key: "reach", label: "Speakers", type: "select", options: ["National", "International", "Both"] },
    { key: "proceedings", label: "Proceedings publication body", width: 220 } ] },
  { kind: "THESIS_SUPERVISION", area: "research", label: "Graduate and doctoral thesis supervision", sar: "Table 5.12", titleLabel: "Program", yearLabel: sem, editors: MANAGERS,
    hint: "Undergraduate projects come from the Final Year Projects module.", fields: [
    { key: "level", label: "Level", type: "select", options: ["Graduate (MS / MPhil / MBA)", "Doctoral"], required: true }, num("theses", "Number of theses"),
    num("supervisors", "Eligible supervisors"), num("maxLoad", "Maximum load per supervisor") ] },
  // Form 6
  { kind: "MOU", area: "outreach", label: "MOUs and linkages", sar: "Tables 6.1a–6.1c", titleLabel: "Partner organisation / institution", dateLabel: "MOU date", file: true, editors: ACADEMIC, fields: [
    { key: "partnerType", label: "Partner", type: "select", options: ["International", "National academic", "Corporate"], required: true }, num("activities", "Activities held under the MOU"),
    { key: "lastDate", label: "Date of the last activity", type: "date" }, { key: "lastTitle", label: "Title of the last activity", width: 260 } ] },
  { kind: "EXCHANGE", area: "outreach", label: "Student and faculty exchanges", sar: "Tables 6.2a, 6.2b", titleLabel: "Partner institution", editors: ACADEMIC, fields: [
    { key: "who", label: "Exchange of", type: "select", options: ["Students", "Faculty"], required: true }, { key: "direction", label: "Flow", type: "select", options: ["Outward", "Inward"], required: true },
    num("count", "Number"), { key: "start", label: "Starting date", type: "date" }, { key: "end", label: "Date of completion", type: "date" } ] },
  { kind: "ADVISORY_MEMBER", area: "outreach", label: "Corporate advisory board members", sar: "Table 6.3", titleLabel: "Member's name", editors: ACADEMIC,
    hint: "Board meetings come from Meetings & Minutes (Industrial advisory board).", fields: [
    { key: "designation", label: "Designation & affiliation", width: 300 }, { key: "since", label: "Member since", width: 120 } ] },
  { kind: "ALUMNI_ACTIVITY", area: "outreach", label: "Alumni participation", sar: "Table 6.5", titleLabel: "Engagement activity", dateLabel: "Date", editors: ACADEMIC, fields: [
    { key: "participation", label: "Participation", type: "select", options: ["Alumni association", "Individual alumni"] }, num("alumni", "Alumni who took part") ] },
  { kind: "COMMUNITY_ACTIVITY", area: "outreach", label: "Community development & social responsibility", sar: "Tables 6.6a, 6.6b", titleLabel: "Activity", dateLabel: "Activity date", editors: [...ACADEMIC, "STUDENT_AFFAIRS"],
    hint: "Society and student activities recorded elsewhere as community service are added automatically.", fields: [
    { key: "partner", label: "Partner organisation (if through an MOU)", width: 240 }, { key: "mouDate", label: "MOU date", type: "date" }, num("students", "Students involved") ] },
  { kind: "ENVIRONMENT_INITIATIVE", area: "outreach", label: "Environmental protection initiatives", sar: "Tables 6.7a, 6.7b", titleLabel: "Initiative / activity", dateLabel: "Date", editors: [...ACADEMIC, "STUDENT_AFFAIRS", "FACILITIES_MANAGER"], fields: [
    { key: "where", label: "Where", type: "select", options: ["On campus", "Outside"], required: true }, { key: "description", label: "Brief description", type: "textarea" },
    { key: "partner", label: "Partner organisation (if through an MOU)", width: 240 }, num("students", "Students involved") ] },
  // Form 7
  { kind: "BUDGET_YEAR", area: "resources", label: "Budgets", sar: "Table 7.1", titleLabel: "Fiscal year (e.g. 2025-26)", editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    num("university", "University budget (PKR)", 150), num("proposed", "Proposed by the business school (PKR)", 150), num("received", "Received by the business school (PKR)", 150),
    { key: "type", label: "Budget type", type: "select", options: ["Explicit", "Implicit"] } ] },
  { kind: "FINANCE_LINE", area: "resources", label: "Revenue and expenses (NBEAC heads)", sar: "Table 7.2", titleLabel: "Particular", titleOptions: FINANCE_PARTICULARS, yearLabel: "Fiscal year (e.g. 2025-26)", editors: [...MANAGERS, "FINANCE_OFFICER"],
    hint: "Enter the business school's figures in PKR million, including the projections for the next two years.", fields: [
    num("amount", "Amount (PKR million)", 140), { key: "projected", label: "Projection", type: "checkbox" } ] },
  { kind: "FINANCIAL_RISK", area: "resources", label: "Financial risks", sar: "Table 7.3", titleLabel: "Financial risk", editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    { key: "remedies", label: "Remedial measures (up to 100 words)", type: "textarea" }, { key: "stakeholders", label: "Stakeholders involved", width: 260 } ] },
  { kind: "SUPPORT_STAFF", area: "resources", label: "Support staff", sar: "Table 7.5", titleLabel: "Function", titleOptions: ["Administration", "Admissions", "Examinations", "Student Affairs", "IT", "Laboratories", "Library", "Placement Office", "Research Centre", "QEC", "Security", "Housekeeping", "Gardening", "Other"], editors: [...MANAGERS, "FACILITIES_MANAGER"], fields: [
    num("number", "Number of staff"), { key: "head", label: "Head of the function", width: 200 }, { key: "headProfile", label: "Qualification & experience of the head", width: 280 } ] },
  { kind: "EMPLOYEE_BENEFIT", area: "resources", label: "Employee benefits & welfare", sar: "Table 7.6", titleLabel: "Benefit / welfare scheme", titleOptions: ["Provident fund / gratuity", "Health insurance", "On-campus medical assistance", "EOBI contribution", "Loan scheme", "Discounted meals", "Discounted transport", "Day care centre", "Further education assistance", "Other"], editors: [...MANAGERS, "FINANCE_OFFICER"], fields: [
    num("faculty", "Faculty beneficiaries"), num("staff", "Staff beneficiaries") ] },
  // Cases (confidential)
  { kind: "GRIEVANCE", area: "cases", label: "Student grievances", sar: "Table 3.12", titleLabel: "Nature of grievance", dateLabel: "Date of grievance", confidential: true, editors: [...CASE_EDITORS, "STUDENT_AFFAIRS"], fields: [
    { key: "action", label: "Action taken", type: "textarea" }, { key: "outcome", label: "Outcome", type: "textarea" } ] },
  { kind: "UNFAIR_MEANS", area: "cases", label: "Unfair means in assessments", sar: "Table 2.12", titleLabel: "Student name / ID", yearLabel: sem, confidential: true, editors: CASE_EDITORS, fields: [
    { key: "program", label: "Degree program", width: 180 }, { key: "assessment", label: "Assessment type", width: 160 }, { key: "offense", label: "Offense", width: 220 }, { key: "outcome", label: "Investigation outcome", type: "textarea" } ] },
  { kind: "PLAGIARISM_CASE", area: "cases", label: "Plagiarism in research work", sar: "Table 5.7", titleLabel: "Research work title", yearLabel: "Year", confidential: true, editors: CASE_EDITORS, fields: [
    { key: "student", label: "Student name / ID", width: 200 }, { key: "program", label: "Degree program", width: 180 },
    { key: "level", label: "Offense level", type: "select", options: ["Minor", "Moderate", "Major", "Not proven"] }, { key: "outcome", label: "Investigation outcome", type: "textarea" } ] },
  { kind: "STUDENT_MISCONDUCT", area: "cases", label: "Student misconduct", sar: "Table 7.7b", titleLabel: "Student(s) involved (name / initials)", dateLabel: "Date reported", confidential: true, editors: [...CASE_EDITORS, "STUDENT_AFFAIRS"], fields: [
    { key: "nature", label: "Nature of misconduct", width: 260 }, { key: "outcome", label: "Outcome of investigation", type: "textarea" }, { key: "action", label: "Action taken", type: "textarea" } ] },
  { kind: "EMPLOYEE_MISCONDUCT", area: "cases", label: "Faculty and staff misconduct", sar: "Table 7.7a", titleLabel: "Faculty / staff involved (name / initials)", dateLabel: "Date of the case", confidential: true, editors: CASE_EDITORS, fields: [
    { key: "nature", label: "Nature of misconduct", width: 260 }, { key: "outcome", label: "Outcome of investigation", type: "textarea" }, { key: "action", label: "Action taken", type: "textarea" } ] },
  { kind: "HARASSMENT", area: "cases", label: "Sexual harassment cases", sar: "Table 7.8", titleLabel: "Person(s) involved (name / initials)", dateLabel: "Date reported", confidential: true, editors: CASE_EDITORS, fields: [
    { key: "outcome", label: "Outcome of investigation", type: "textarea" }, { key: "action", label: "Action taken", type: "textarea" } ] },
];
export const kindDef = (kind: string) => KINDS.find((k) => k.kind === kind) || null;
export const kindsOf = (area: AreaKey) => KINDS.filter((k) => k.area === area);
export const sectionsOf = (area: AreaKey) => SECTIONS.filter((s) => s.area === area);

/** Cleans submitted values against a field list: unknown keys dropped, numbers parsed, text trimmed and capped. */
export function cleanValues(fields: Field[], raw: Record<string, unknown>) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const f of fields) {
    const v = raw?.[f.key];
    if (f.type === "checkbox") out[f.key] = v === true;
    else if (f.type === "number") { const n = v === "" || v === null || v === undefined ? null : Number(v); out[f.key] = n !== null && Number.isFinite(n) ? n : null; }
    else if (f.type === "date") out[f.key] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    else if (f.type === "select") out[f.key] = typeof v === "string" && f.options?.includes(v) ? v : null;
    else out[f.key] = typeof v === "string" ? v.trim().slice(0, f.type === "textarea" ? 5000 : 500) || null : null;
  }
  return out;
}
export const missingRequired = (fields: Field[], values: Record<string, unknown>) => fields.filter((f) => f.required && (values[f.key] === null || values[f.key] === undefined || values[f.key] === "")).map((f) => f.label);
