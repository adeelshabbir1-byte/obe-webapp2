import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import AssignSubjectExpertsManager from "../../../components/AssignSubjectExpertsManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
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
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function AssignSubjectExpertsPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const selectedBatchId = searchParams.batchId || "";

  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, ...(selectedBatchId ? { batchId: selectedBatchId } : {}) },
    orderBy: [{ semesterNumber: "asc" }, { createdAt: "desc" }],
    include: { batch: true, contentSyncMember: { include: { group: { include: { members: { include: { course: { select: { code: true } } } } } } } } },
  });

  // A course is assignable here if it's not tracked in a content-sync
  // group at all, or if it IS that group's own base — a non-base
  // follower inherits its content (and its Subject Expert) from its
  // base, so assigning one directly is blocked server-side anyway; this
  // page only shows the courses that can actually take an assignment.
  const courses = allCourses.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase);
  const followerCount = allCourses.length - courses.length;

  const subjectExperts = await prisma.user.findMany({
    where: { role: "SUBJECT_EXPERT", managedById: user.id },
    orderBy: { name: "asc" },
  });

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Assign Subject Experts</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Only courses that can actually take a direct assignment are listed here — a course that's linked as
        a follower of another section inherits its Subject Expert automatically and isn't shown.
        {followerCount > 0 && ` (${followerCount} linked follower course${followerCount === 1 ? "" : "s"} hidden.)`}
      </p>
      <AssignSubjectExpertsManager
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
          subjectExpertId: c.subjectExpertId,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
          linkedFollowerCodes: c.contentSyncMember?.group.members.length
            ? c.contentSyncMember.group.members.filter((m) => m.course.code !== c.code).map((m) => m.course.code)
            : [],
        }))}
        subjectExperts={subjectExperts.map((se) => ({ id: se.id, name: se.name }))}
        batches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))}
        selectedBatchId={selectedBatchId}
      />
    </Shell>
  );
}
