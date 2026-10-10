import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import ElectiveOptionsManager from "../../../components/ElectiveOptionsManager";
import { navForRole } from "../../../components/reportNav";


export default async function ElectiveOptionsPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const selectedBatchId = searchParams.batchId || batches[0]?.id || "";

  const electiveCourses = selectedBatchId
    ? await prisma.course.findMany({
        where: { batchId: selectedBatchId, courseType: "Elective" },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      })
    : [];

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Elective Options</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Offer more than one real course for the same elective slot, and let students pick between them through
        a public link.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Load</button>
        </form>
      </div>

      {selectedBatchId && (
        <ElectiveOptionsManager
          batchId={selectedBatchId}
          electiveCourses={electiveCourses.map((c) => ({ id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber }))}
        />
      )}
    </Shell>
  );
}
