import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import HistoricalGradesUpload from "../../../components/HistoricalGradesUpload";

const NAV = [
  { href: "/coordinator/faculty", label: "Teacher Onboarding" }, { href: "/coordinator/faculty-requests", label: "Teachers from Other Departments" }, { href: "/program-moves", label: "Teacher Program Moves" }, { href: "/coordinator/lab-engineers", label: "Lab Engineers" }, { href: "/course-leads", label: "Course Leads" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Teacher Categories" },
  { href: "/coordinator/out-of-batch-requests", label: "Out-of-Batch Requests" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/bulk-student-upload", label: "Bulk Student Upload (Multi-Batch)" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/deficiency-status", label: "Deficiency Courses Status" },
  { href: "/public-library", label: "Public Course Library" },
  { href: "/coordinator/historical-grades-upload", label: "Historical Grades Upload" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function HistoricalGradesUploadPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    select: { id: true, degreeProgram: true, batchName: true },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Historical Grades Upload</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        For a batch whose earlier semesters happened before this system was in use — load their course grades
        in bulk so their transcript, CGPA, and Courses Remaining are accurate going forward. To fix or add just
        one grade for one student, use the Add button on their page under Student Transcript instead.
      </p>
      {batches.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Create a batch first.</p></div>
      ) : (
        <HistoricalGradesUpload batches={batches} />
      )}
    </Shell>
  );
}
