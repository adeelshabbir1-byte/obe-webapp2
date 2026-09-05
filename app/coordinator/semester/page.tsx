import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import SemesterManager from "../../../components/SemesterManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function CoordinatorSemesterPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const currentTerm = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id } });

  const offeredCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, isOffered: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true },
  });

  const notOfferedCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, isOffered: false },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    include: { batch: true },
  });

  const instructors = await prisma.user.findMany({ where: { role: "INSTRUCTOR", managedById: user.id }, orderBy: { name: "asc" } });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Current Semester</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set the current term to automatically offer every batch's current-semester courses, then assign instructors.
      </p>
      <SemesterManager
        currentTerm={currentTerm ? { termName: currentTerm.termName, year: currentTerm.year } : null}
        offeredCourses={offeredCourses.map((c) => ({
          id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber, instructorId: c.instructorId,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        }))}
        notOfferedCourses={notOfferedCourses.map((c) => ({
          id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        }))}
        instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
      />
    </Shell>
  );
}
