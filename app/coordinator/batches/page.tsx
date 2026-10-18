import { advisorCandidatesWhere } from "../../../lib/advisors";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import BatchesManager from "../../../components/BatchesManager";
import DegreeProgramsAndIntakeManager from "../../../components/DegreeProgramsAndIntakeManager";
import { navForRole } from "../../../components/reportNav";


export default async function BatchesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { _count: { select: { courses: true, students: true } } },
  });
  // Credit hours per batch and semester (non-credit deficiency courses don't count).
  const crRows = await prisma.course.groupBy({ by: ["batchId", "semesterNumber"], where: { batchId: { in: batches.map((b) => b.id) }, isNonCredit: false }, _sum: { creditHours: true } });
  const creditsOf = (batchId: string) => {
    const rows = crRows.filter((r) => r.batchId === batchId);
    return { total: rows.reduce((n, r) => n + (r._sum.creditHours || 0), 0), bySemester: rows.filter((r) => r.semesterNumber).sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0)).map((r) => ({ sem: r.semesterNumber as number, cr: r._sum.creditHours || 0 })) };
  };
  const degreePrograms = await prisma.degreeProgram.findMany({ where: { coordinatorId: user.id }, orderBy: { name: "asc" } });
  // Any teacher can advise a batch: the people this Program Lead manages, the Lead themself, and teachers of the same
  // department (Chairman, other Program Leads, Instructors) — not only plain Instructors / Subject Experts.
  const faculty = await prisma.user.findMany({ where: advisorCandidatesWhere(user), orderBy: { name: "asc" } });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Departments &amp; Programs</h1>
        <a href="/api/coordinator/batches/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Different batches/cohorts can follow different schemes of studies. Create a batch here, then import
        or add courses into it — the same HEC curriculum can be imported fresh for each new batch.
      </p>
      <DegreeProgramsAndIntakeManager programs={degreePrograms} />
      <BatchesManager
        initialBatches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName, startTerm: b.startTerm, startYear: b.startYear, studentCount: b.studentCount, enrolledCount: b._count.students, courseCount: b._count.courses, credits: creditsOf(b.id), registrationOpen: b.registrationOpen, advisorId: b.advisorId }))}
        faculty={faculty.map((f) => ({ id: f.id, name: f.name }))}
      />
    </Shell>
  );
}
