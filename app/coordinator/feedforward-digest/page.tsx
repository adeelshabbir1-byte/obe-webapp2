import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

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
  { href: "/faculty/profile", label: "My Profile" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/lab-inventory", label: "Lab Inventory" }, { href: "/library-inventory", label: "Library Inventory" }, { href: "/coordinator/activities", label: "Extra-curricular Activities" }, { href: "/coordinator/accreditation-status", label: "Accreditation Status" }, { href: "/coordinator/hec-comparison", label: "Curriculum vs HEC" }, { href: "/coordinator/evidence", label: "Accreditation Evidence" }, { href: "/coordinator/course-folders", label: "Course Folders" }, { href: "/deadlines", label: "Deadlines" }, { href: "/academic-calendar", label: "Academic Calendar" }, { href: "/admission-criteria", label: "Admission Criteria" }, { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function FeedForwardDigestPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const notes = await prisma.feedForwardNote.findMany({
    where: { course: { coordinatorId: user.id } },
    include: { course: { include: { batch: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feed-Forward Notes Digest</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every note instructors have left for whoever teaches a course next — a rolled-up "lessons learned" view.
      </p>
      <div className="card">
        {notes.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No feed-forward notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 3 }}>
              {n.course.code} — {n.course.title} ({n.course.batch ? `${n.course.batch.degreeProgram} — ${n.course.batch.batchName}` : "—"}) · {n.createdAt.toISOString().slice(0, 10)}
            </div>
            <div style={{ fontSize: 13 }}>{n.body}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
