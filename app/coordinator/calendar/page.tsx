import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CalendarManager from "../../../components/CalendarManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Faculty Categories" },
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
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function CalendarPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [holidays, dayModes, courses, semesterDates, batches, currentTerm] = await Promise.all([
    prisma.holiday.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } }),
    prisma.classDayMode.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } }),
    prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true }, orderBy: { code: "asc" } }),
    prisma.semesterDates.findMany({ where: { coordinatorId: user.id }, orderBy: [{ termYear: "desc" }, { degreeProgram: "asc" }] }),
    prisma.batch.findMany({ where: { coordinatorId: user.id } }),
    prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } }),
  ]);

  const degreePrograms = Array.from(new Set(batches.map((b) => b.degreeProgram)));

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Calendar & Exam Dates</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set semester start/midterm/final dates once per Degree Program — applies to every course currently
        offered under it. Individual courses can still override with their own dates if genuinely different.
        All of this feeds into how Instructors' lecture dates auto-fill, and into delivery reports.
      </p>
      <CalendarManager
        initialHolidays={holidays.map((h) => ({ id: h.id, date: h.date.toISOString(), label: h.label }))}
        initialDayModes={dayModes.map((m) => ({ id: m.id, date: m.date.toISOString(), mode: m.mode }))}
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title,
          midtermStartDate: c.midtermStartDate?.toISOString() || null, midtermEndDate: c.midtermEndDate?.toISOString() || null,
          finalStartDate: c.finalStartDate?.toISOString() || null, finalEndDate: c.finalEndDate?.toISOString() || null,
        }))}
        degreePrograms={degreePrograms}
        initialSemesterDates={semesterDates.map((d) => ({
          degreeProgram: d.degreeProgram, termName: d.termName, termYear: d.termYear,
          semesterStartDate: d.semesterStartDate?.toISOString() || null,
          midtermStartDate: d.midtermStartDate?.toISOString() || null, midtermEndDate: d.midtermEndDate?.toISOString() || null,
          finalStartDate: d.finalStartDate?.toISOString() || null, finalEndDate: d.finalEndDate?.toISOString() || null,
        }))}
        defaultTermName={currentTerm?.termName || "Fall"}
        defaultTermYear={currentTerm?.year || new Date().getFullYear()}
      />
    </Shell>
  );
}
