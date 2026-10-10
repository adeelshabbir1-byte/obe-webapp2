import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import BulkStudentUpload from "../../../components/BulkStudentUpload";
import { navForRole } from "../../../components/reportNav";


export default async function BulkStudentUploadPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    select: { degreeProgram: true, batchName: true },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bulk Student Upload (Multi-Batch)</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Upload students for any number of your batches in a single file — each row names its own batch,
        which is checked against your real batches before anything is saved. Logins are activated
        automatically for every student this creates or touches.
      </p>
      {batches.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Create a batch first.</p></div>
      ) : (
        <BulkStudentUpload batches={batches} />
      )}
    </Shell>
  );
}
