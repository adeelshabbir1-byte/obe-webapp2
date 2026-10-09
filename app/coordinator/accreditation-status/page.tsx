import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import ReadinessReport from "../../../components/ReadinessReport";
import { computeReadiness } from "../../../lib/readiness";

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
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/faculty/profile", label: "My Profile" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/coordinator/accreditation-status", label: "Accreditation Status" }, { href: "/coordinator/hec-comparison", label: "Curriculum vs HEC" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

// ---- How "ready" the program is for accreditation (NCEAC-style outcome-based review) --------------------------------
// Every number here is counted live from the app's own records. A score is the share of things that are done; half-done

export default async function AccreditationStatusPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const data = await computeReadiness(user, searchParams.batchId || "");
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <ReadinessReport data={data} />
    </Shell>
  );
}
