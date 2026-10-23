// Who does what — the task analysis behind the lighter menus (lib/roleMenus.ts) and the ownership changes of Prompt 3.
// D = does it, A = approves, I = informed, V = may view. Position names are the defaults; each institute's own titles apply.

export const POSITIONS = ["Institute Head", "Dean", "HOD", "Program Lead", "OMC Convener", "OMC member", "QEC Convener", "Controller of Exams", "Subject Expert", "Instructor", "Lab Engineer", "Advisor", "Course Assigner", "Student Affairs", "Finance", "Facilities", "Librarian", "Student"] as const;
type P = (typeof POSITIONS)[number];
export type Row = { area: string; task: string; D: P[]; A?: P[]; I?: P[]; V?: P[] };

export const MATRIX: Row[] = [
  // Structure
  { area: "Structure", task: "Organisation chart, position titles, assigning people", D: ["Institute Head"], I: ["Dean", "HOD"], V: ["Dean", "HOD", "Program Lead"] },
  { area: "Structure", task: "Name the Controller of Examinations, QEC Convener, OMC Conveners", D: ["Institute Head"], I: ["Dean"] },
  { area: "Structure", task: "Departments, programs and their council (NCEAC / NBEAC / PEC)", D: ["Institute Head"], A: ["Dean"], V: ["HOD", "Program Lead"] },
  // Curriculum
  { area: "Curriculum", task: "Scheme of studies, batches, course catalogue", D: ["Program Lead"], A: ["HOD", "Dean"], V: ["OMC Convener", "QEC Convener"] },
  { area: "Curriculum", task: "Graduate attributes (GA/PLO) and PEOs", D: ["Program Lead"], A: ["OMC Convener", "HOD"], V: ["Dean", "QEC Convener"] },
  { area: "Curriculum", task: "Assign Subject Experts", D: ["Program Lead"], I: ["Subject Expert"] },
  { area: "Curriculum", task: "CLOs, CLO→GA mapping, lecture plan, assessment plan", D: ["Subject Expert"], A: ["OMC member"], I: ["Program Lead"], V: ["Instructor"] },
  { area: "Curriculum", task: "Review course designs (OMC queue), weight exceptions, template changes", D: ["OMC member"], A: ["OMC Convener"], I: ["Program Lead"] },
  { area: "Curriculum", task: "Assessment-type rules, passing criteria, weight policy (own department)", D: ["OMC Convener"], A: ["HOD"], V: ["Program Lead", "Subject Expert"] },
  { area: "Curriculum", task: "New program proposal and approval", D: ["HOD"], A: ["Dean", "Institute Head"], I: ["QEC Convener"] },
  // Semester
  { area: "Semester", task: "Offer courses, sections, timetable, calendar dates", D: ["Program Lead"], A: ["HOD"], I: ["Instructor"] },
  { area: "Semester", task: "Course allocation (who teaches what)", D: ["Course Assigner"], A: ["HOD"], I: ["Instructor"] },
  { area: "Semester", task: "Teach, attendance, marks, lab plans", D: ["Instructor"], V: ["Program Lead", "Advisor"] },
  { area: "Semester", task: "Lab sessions and lab manuals", D: ["Lab Engineer"], A: ["Instructor"] },
  { area: "Semester", task: "Leave and class cover", D: ["Instructor"], A: ["HOD", "Dean"] },
  // Students
  { area: "Students", task: "Student directory, uploads", D: ["Program Lead"], V: ["Advisor", "HOD"] },
  { area: "Students", task: "Advising, degree plans, registration holds", D: ["Advisor"], A: ["Program Lead"], I: ["Student"] },
  { area: "Students", task: "Counselling sessions", D: ["Advisor", "Student Affairs"], V: [] },
  { area: "Students", task: "Student status changes (drop, freeze, transfer, readmission)", D: ["Advisor", "Program Lead"], A: ["HOD", "Controller of Exams"], I: ["Instructor", "Finance"] },
  { area: "Students", task: "Admissions, societies, placements, complaints, accommodations", D: ["Student Affairs"], V: ["Dean"] },
  // Examinations
  { area: "Examinations", task: "Academic rules: CGPA limits, attendance needed to sit exams", D: ["Controller of Exams"], A: ["Dean"], V: ["Program Lead", "Advisor"] },
  { area: "Examinations", task: "Exam sessions, date sheets, seating, invigilation, admit cards", D: ["Controller of Exams"], I: ["Instructor", "Student"] },
  { area: "Examinations", task: "Debarred (short attendance) lists", D: ["Controller of Exams"], I: ["Instructor", "Advisor", "Student"] },
  { area: "Examinations", task: "Question paper vetting", D: ["OMC member"], A: ["OMC Convener"], I: ["Controller of Exams"] },
  { area: "Examinations", task: "Paper printing and custody, unfair means in exams", D: ["Controller of Exams"] },
  { area: "Examinations", task: "Course results approval", D: ["Instructor"], A: ["OMC Convener"], I: ["Controller of Exams"] },
  { area: "Examinations", task: "Publish results, re-checking window", D: ["Controller of Exams"], I: ["Student"] },
  { area: "Examinations", task: "Grade change after publication", D: ["Instructor"], A: ["HOD", "Controller of Exams"] },
  { area: "Examinations", task: "Official transcripts, degree audit, degrees, verification", D: ["Controller of Exams"], A: ["Institute Head"], V: ["Program Lead"] },
  // Quality
  { area: "Quality", task: "Feedback questionnaires and windows; surveys", D: ["QEC Convener"], V: ["Dean", "HOD"] },
  { area: "Quality", task: "Feedback results per teacher", D: ["QEC Convener"], V: ["Instructor", "HOD", "Dean"] },
  { area: "Quality", task: "HEC QAA self-assessment, IPE, rankings data, PQR", D: ["QEC Convener"], A: ["Institute Head"] },
  { area: "Quality", task: "CQI records and actions", D: ["Program Lead", "Subject Expert"], A: ["OMC Convener"], V: ["QEC Convener"] },
  { area: "Quality", task: "Plagiarism records, policy versions, committees", D: ["QEC Convener"], V: ["Dean"] },
  // Accreditation
  { area: "Accreditation", task: "Open a visit, assign tasks", D: ["Dean", "HOD"], A: ["Institute Head"] },
  { area: "Accreditation", task: "Work on assigned SAR tasks, evidence", D: ["Program Lead"], A: ["HOD", "Dean"] },
  { area: "Accreditation", task: "Visit day plan and mock visit", D: ["Program Lead"], A: ["Dean"], I: ["Instructor"] },
  // Faculty
  { area: "Faculty", task: "Recruitment", D: ["HOD"], A: ["Dean", "Institute Head"], I: ["Finance"] },
  { area: "Faculty", task: "Faculty development sessions and hours", D: ["HOD"], A: ["Dean"], V: ["Instructor"] },
  { area: "Faculty", task: "Faculty performance report and appraisal", D: ["HOD"], A: ["Dean"], V: ["Instructor"] },
  // Operations
  { area: "Operations", task: "Budget, fees, refunds, payroll, benefits", D: ["Finance"], A: ["Institute Head"] },
  { area: "Operations", task: "Rooms, bookings, assets, meals", D: ["Facilities"], V: ["Instructor"] },
  { area: "Operations", task: "Library circulation and clearance", D: ["Librarian"], I: ["Controller of Exams"] },
];

/** The matrix as Markdown (docs/role-task-matrix.md is generated from this). */
export function matrixMarkdown() {
  const out = ["# Who does what", "", "D = does it · A = approves · I = informed · V = may view (read-only).", ""];
  for (const area of Array.from(new Set(MATRIX.map((r) => r.area)))) {
    out.push(`## ${area}`, "", "| Task | Does | Approves | Informed | Views |", "|---|---|---|---|---|");
    for (const r of MATRIX.filter((x) => x.area === area)) out.push(`| ${r.task} | ${r.D.join(", ")} | ${(r.A || []).join(", ")} | ${(r.I || []).join(", ")} | ${(r.V || []).join(", ")} |`);
    out.push("");
  }
  return out.join("\n");
}
