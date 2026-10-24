import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, roleLabel , batchScopeFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { prisma } from "../../../../lib/db";
import { computeStudentTranscriptReport } from "../../../../lib/studentTranscriptReport";
import { navForRole } from "../../../../components/reportNav";
import StudentPicker from "../../../../components/StudentPicker";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import TranscriptView from "../../../../components/TranscriptView";

export default async function OmcStudentTranscriptPage({ searchParams }: { searchParams: { studentId?: string; q?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.student-transcript"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds }, ...batchScopeFor(user) }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchIds = batches.map((b) => b.id);

  const q = searchParams.q || "";

  const student = searchParams.studentId ? await prisma.student.findUnique({ where: { id: searchParams.studentId }, include: { batch: true } }) : null;
  const inScope = student && batchIds.includes(student.batchId);

  const report = student && inScope ? await computeStudentTranscriptReport(student.id) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Student Transcript" />
      <StudentPicker current={student?.id || null} />

      {searchParams.studentId && !inScope && (
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>Student not found in your scope.</p></div>
      )}

      {student && inScope && report && (
        <TranscriptView studentId={student.id} tab={searchParams.tab || "grades"} base={`/omc/reports/student-transcript?studentId=${student.id}`} staff />
      )}
    </Shell>
  );
}
