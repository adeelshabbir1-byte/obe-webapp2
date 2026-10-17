// Download formats for every upload that reads a spreadsheet: the exact columns the importer looks for, one example
// row, and an Instructions sheet. Served by /api/templates/[name]. Keep these in step with the importers they describe.
export type TemplateSheet = { name: string; headers: string[]; rows: (string | number)[][]; widths?: number[] };
export type Template = { file: string; csv?: boolean; title: string; notes: string[]; sheets: TemplateSheet[] };

export const TEMPLATES: Record<string, Template> = {
  plos: {
    file: "PLOs format.xlsx", title: "Program Learning Outcomes (PLOs)",
    notes: ["One row per PLO. # is the PLO number.", "PLOs whose number already exists in the batch are skipped, so the file can be uploaded again safely."],
    sheets: [{ name: "PLOs", headers: ["#", "Title", "Description"], rows: [[1, "Engineering Knowledge", "An ability to apply knowledge of mathematics, science and engineering fundamentals to the solution of complex engineering problems."], [2, "Problem Analysis", "An ability to identify, formulate and analyse complex engineering problems."]], widths: [6, 28, 90] }],
  },
  students: {
    file: "Students format.xlsx", title: "Students of one batch",
    notes: ["Column A = Name, Column B = Roll Number. Keep the heading row or remove it; it is skipped either way.", "Students whose roll number already exists are skipped."],
    sheets: [{ name: "Students", headers: ["Name", "Roll Number"], rows: [["Ali Khan", "2026-CS-001"], ["Sara Ahmed", "2026-CS-002"]], widths: [30, 18] }],
  },
  "historical-grades": {
    file: "Historical grades format.xlsx", title: "Grades from earlier semesters",
    notes: ["One row per student per course, in this column order.", "Term Name is Fall, Spring or Summer; Term Year is the year (e.g. 2022).", "Grade is the letter grade (A, A-, B+ …) from your grading scale. Rows already imported are skipped."],
    sheets: [{ name: "Grades", headers: ["Roll Number", "Course Code", "Course Title", "Credit Hours", "Grade", "Term Name", "Term Year"], rows: [["2022-CS-014", "CS101", "Introduction to Programming", 3, "B+", "Fall", 2022]], widths: [16, 12, 34, 12, 8, 10, 10] }],
  },
  "official-clos": {
    file: "Official curriculum CLOs format.xlsx", title: "CLOs and PLO mapping for the official curriculum",
    notes: ["One row per CLO. Course Code must match a course in this curriculum.", "Bloom is C1–C6, P1–P7 or A1–A5. Mapped PLO is the PLO number (e.g. 3 or PLO-3)."],
    sheets: [{ name: "CLOs", headers: ["Course Code", "CLO", "Statement", "Bloom", "Mapped PLO"], rows: [["CS101", "CLO-1", "Explain the basic constructs of a programming language.", "C2", 1], ["CS101", "CLO-2", "Apply loops and functions to solve computing problems.", "C3", 2]], widths: [12, 8, 70, 8, 12] }],
  },
  "curriculum-workbook": {
    file: "Curriculum workbook format.xlsx", title: "A full curriculum in one workbook",
    notes: ["Five sheets: Curriculum, PLOs, Courses, CLOs, Lecture topics. Only Curriculum and Courses are required.", "The Curriculum sheet needs a Degree program row; change Version to import the same program again.", "Course codes in CLOs and Lecture topics must match the Courses sheet."],
    sheets: [
      { name: "Curriculum", headers: ["Item", "Value"], rows: [["Degree program", "BS Computer Science"], ["Authority", "HEC"], ["Version", "2026"]], widths: [20, 40] },
      { name: "PLOs", headers: ["PLO", "Title", "Description"], rows: [[1, "Academic Education", "To prepare graduates as computing professionals."]], widths: [6, 28, 80] },
      { name: "Courses", headers: ["Code", "Title", "Credit hours", "Category", "Domain", "Semester", "Description", "Textbook", "Reference"], rows: [["CS101", "Programming Fundamentals", 4, "Core", "Computing", 1, "Basic programming constructs.", "Deitel, C++ How to Program", ""]], widths: [10, 30, 12, 12, 14, 10, 40, 30, 30] },
      { name: "CLOs", headers: ["Course code", "Statement", "Bloom", "PLO"], rows: [["CS101", "Apply loops and functions to solve problems.", "C3", 1]], widths: [12, 60, 8, 6] },
      { name: "Lecture topics", headers: ["Course code", "Lecture", "Topic", "Sub topic", "CLO"], rows: [["CS101", 1, "Introduction to programming", "Compilers and IDEs", 1]], widths: [12, 8, 36, 30, 6] },
    ],
  },
  "messaging-contacts": {
    file: "Student and guardian numbers format.csv", csv: true, title: "Student and guardian mobile numbers",
    notes: ["Save as CSV. Mobile numbers in any common form (0300-1234567 or +923001234567)."],
    sheets: [{ name: "Contacts", headers: ["Roll number", "Student mobile", "Guardian mobile"], rows: [["2026-CS-001", "0300-1234567", "0321-7654321"]] }],
  },
  "lms-gradebook": {
    file: "Gradebook format.csv", csv: true, title: "Gradebook (CSV)",
    notes: ["Save as CSV. Exports from Moodle, Google Classroom and Canvas work as they are.", "Needs a roll number column (Roll No, ID number, Registration No, Username or Email); every other number column can be matched to an assessment after upload."],
    sheets: [{ name: "Gradebook", headers: ["Roll No", "Name", "Quiz 1", "Assignment 1", "Midterm"], rows: [["2026-CS-001", "Ali Khan", 8, 9, 22]] }],
  },
};
