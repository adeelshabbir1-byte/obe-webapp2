import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import HistoricalGradesUpload from "../../../components/HistoricalGradesUpload";
import { navForRole } from "../../../components/reportNav";


export default async function HistoricalGradesUploadPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    select: { id: true, degreeProgram: true, batchName: true },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Historical Grades Upload</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        For a batch whose earlier semesters happened before this system was in use — load their course grades
        in bulk so their transcript, CGPA, and Courses Remaining are accurate going forward. To fix or add just
        one grade for one student, use the Add button on their page under Student Transcript instead.
      </p>
      {batches.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Create a batch first.</p></div>
      ) : (
        <HistoricalGradesUpload batches={batches} />
      )}
    </Shell>
  );
}
