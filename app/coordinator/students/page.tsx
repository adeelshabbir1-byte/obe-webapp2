import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import StudentManager from "../../../components/StudentManager";
import { navForRole } from "../../../components/reportNav";


export default async function StudentsPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchId = searchParams.batchId || batches[0]?.id || "";
  const students = batchId ? await prisma.student.findMany({ where: { batchId }, orderBy: { rollNumber: "asc" } }) : [];

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Students</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Bulk-import students per batch — this is the roster used for marks entry and results.</p>
      {batches.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Create a batch first.</p></div>
      ) : (
        <StudentManager
          batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))}
          initialBatchId={batchId}
          students={students.map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, currentSemesterNumber: s.currentSemesterNumber, track: s.track }))}
        />
      )}
    </Shell>
  );
}
