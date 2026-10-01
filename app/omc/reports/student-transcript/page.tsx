import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, roleLabel } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { prisma } from "../../../../lib/db";
import { computeStudentTranscriptReport } from "../../../../lib/studentTranscriptReport";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import StudentTranscriptReport from "../../../../components/StudentTranscriptReport";

export default async function OmcStudentTranscriptPage({ searchParams }: { searchParams: { studentId?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.student-transcript"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchIds = batches.map((b) => b.id);

  const q = searchParams.q || "";
  const matches = q
    ? await prisma.student.findMany({ where: { batchId: { in: batchIds }, OR: [{ name: { contains: q, mode: "insensitive" } }, { rollNumber: { contains: q, mode: "insensitive" } }] }, include: { batch: true }, take: 20 })
    : [];

  const student = searchParams.studentId ? await prisma.student.findUnique({ where: { id: searchParams.studentId }, include: { batch: true } }) : null;
  const inScope = student && batchIds.includes(student.batchId);

  const report = student && inScope ? await computeStudentTranscriptReport(student.id) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Student Transcript" />
      <div className="card no-print">
        <form method="GET" style={{ display: "flex", gap: 10 }}>
          <input name="q" defaultValue={q} placeholder="Search by name or roll number..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--line)" }} />
          <button type="submit" className="btn btn-brass">Search</button>
        </form>
        {matches.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {matches.map((m) => (
              <a key={m.id} href={`/omc/reports/student-transcript?studentId=${m.id}`} style={{ display: "block", padding: "6px 4px", fontSize: 13, color: "var(--brass-dark)", textDecoration: "none", borderBottom: "1px solid var(--line)" }}>
                {m.name} — {m.rollNumber} ({m.batch.degreeProgram} — {m.batch.batchName})
              </a>
            ))}
          </div>
        )}
      </div>

      {searchParams.studentId && !inScope && (
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>Student not found in your scope.</p></div>
      )}

      {student && inScope && report && (
        <StudentTranscriptReport
          studentName={student.name} rollNumber={student.rollNumber}
          batchLabel={`${student.batch.degreeProgram} (${student.batch.batchName})`}
          courseRows={report.courseRows} cgpa={report.cgpa} totalCredits={report.totalCredits}
          cloAgg={report.cloAgg} ploAgg={report.ploAgg} remediation={report.remediation}
        />
      )}
    </Shell>
  );
}
