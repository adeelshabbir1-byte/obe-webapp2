import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

function StatCard({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${warn ? "var(--rust)" : "var(--line)"}`, padding: "14px 18px", minWidth: 150 }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif", color: warn ? "var(--rust)" : "var(--ink)" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{label}</div>
    </div>
  );
}

export default async function SemesterHealthPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const offeredCourses = await prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true }, include: { instructor: true, subjectExpert: true } });
  const total = offeredCourses.length;
  const approved = offeredCourses.filter((c) => c.templateStatus === "approved").length;
  const submitted = offeredCourses.filter((c) => c.templateStatus === "submitted").length;
  const changesRequested = offeredCourses.filter((c) => c.templateStatus === "changes-requested").length;
  const draft = offeredCourses.filter((c) => c.templateStatus === "draft").length;
  const noInstructor = offeredCourses.filter((c) => !c.instructorId).length;
  const noSE = offeredCourses.filter((c) => !c.subjectExpertId).length;

  const faculty = await prisma.user.findMany({ where: { role: "INSTRUCTOR", managedById: user.id } });
  const sectionAssignments = await prisma.courseSectionAssignment.findMany({ where: { course: { coordinatorId: user.id, isOffered: true } } });
  const loadByFaculty: Record<string, number> = {};
  for (const a of sectionAssignments) loadByFaculty[a.instructorId] = (loadByFaculty[a.instructorId] || 0) + a.sectionCount;
  const overLoaded = faculty.filter((f) => (loadByFaculty[f.id] || 0) + f.externalLoadCount > f.normalLoad).length;

  const pendingExceptions = await prisma.weightExceptionRequest.count({ where: { status: "pending", course: { coordinatorId: user.id } } });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Semester Health</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A one-page check on whether this semester is on track.
      </p>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Course Templates</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <StatCard label="Courses Offered" value={total} />
          <StatCard label="Approved" value={approved} />
          <StatCard label="Submitted, Pending Review" value={submitted} />
          <StatCard label="Changes Requested" value={changesRequested} warn={changesRequested > 0} />
          <StatCard label="Still Draft" value={draft} warn={draft > 0} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Staffing</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <StatCard label="Courses with no Subject Expert" value={noSE} warn={noSE > 0} />
          <StatCard label="Courses with no Instructor" value={noInstructor} warn={noInstructor > 0} />
          <StatCard label="Faculty Over Their Load Limit" value={overLoaded} warn={overLoaded > 0} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Governance</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <StatCard label="Pending Weight Exceptions" value={pendingExceptions} warn={pendingExceptions > 0} />
        </div>
      </div>
    </Shell>
  );
}
