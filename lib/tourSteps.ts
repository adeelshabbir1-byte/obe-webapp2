// Presentation tour: a fixed walk through the key screens (best signed in as a Program Lead, e.g. dream.lead.cs in the demo institute).
export const TOUR_STEPS: { href: string; title: string; text: string }[] = [
  { href: "/dashboard", title: "Dashboard", text: "Each person starts here: the Today panel shows overdue tasks, marks still to enter and results waiting for approval." },
  { href: "/coordinator/batches", title: "Batches", text: "Every intake of a program, with its students, semester and advisor." },
  { href: "/coordinator/courses", title: "Courses & plans", text: "All courses of the program by semester; Subject Experts write the plan (CLOs, topics, assessments), the OMC approves it." },
  { href: "/coordinator/semester", title: "Offering a semester", text: "Offer the semester's courses; students are enrolled and instructors receive the approved plan." },
  { href: "/outcome-flow", title: "Outcome Flow", text: "Assessments → CLOs → Courses → PLOs → PEOs. Click a PEO, then a PLO, then a course to follow the chain with real attainment." },
  { href: "/plo-progress", title: "PLO progress", text: "How the batch's PLO attainment grows semester by semester — the evidence that CQI is working." },
  { href: "/coordinator/student-transcript", title: "Transcripts", text: "Grades, GPA/CGPA and each student's CLO and PLO attainment per course." },
  { href: "/omc/reports", title: "Reports", text: "Ready-made OBE reports for NCEAC / NBEAC: attainment, coverage, distributions, CQI." },
  { href: "/deadlines", title: "Deadlines", text: "The semester plan: who must finish what by when, with reminders and late flags." },
  { href: "/accreditation/readiness", title: "Accreditation readiness", text: "What is complete and what is missing before an accreditation visit." },
];
export const TOUR_KEY = "obe:tour-step";
