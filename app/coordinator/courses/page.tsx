import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CoursesManager from "../../../components/CoursesManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function CoordinatorCoursesPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const selectedBatchId = searchParams.batchId || "";

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id, ...(selectedBatchId ? { batchId: selectedBatchId } : {}) },
    orderBy: [{ semesterNumber: "asc" }, { createdAt: "desc" }],
    include: { batch: true },
  });

  const subjectExperts = await prisma.user.findMany({
    where: { role: "SUBJECT_EXPERT", managedById: user.id },
    orderBy: { name: "asc" },
  });

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  const curricula = await prisma.masterCurriculum.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ authority: "asc" }, { title: "asc" }, { version: "desc" }],
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses</h1>
        <a href="/api/coordinator/courses/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Import from any published curriculum into a specific batch, or add courses manually. Everything stays editable afterward.
      </p>
      <CoursesManager
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
          semesterNumber: c.semesterNumber, fromHec: !!c.masterCourseId, subjectExpertId: c.subjectExpertId,
          fromBenchmark: !!c.benchmarkSourceId,
          prerequisiteCourseId: c.prerequisiteCourseId, batchId: c.batchId,
          batchName: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : null,
        }))}
        subjectExperts={subjectExperts.map((se) => ({ id: se.id, name: se.name }))}
        batches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))}
        curricula={curricula.map((c) => ({ id: c.id, authority: c.authority, title: c.title, version: c.version }))}
        selectedBatchId={selectedBatchId}
      />
    </Shell>
  );
}
