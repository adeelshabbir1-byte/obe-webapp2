import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import SetupStrip from "../../../../components/SetupStrip";
import BatchReviewView from "../../../../components/BatchReviewView";

// Step 13 of the batch set-up: the three-way comparison, then "Send to the OMC"; afterwards the OMC's proposals
// (the Program Lead's opinion on each) and, once finalised, the final version with its summary of changes.
export default async function BatchReviewPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const b = await prisma.batch.findFirst({ where: { id: searchParams.batchId || "", coordinatorId: user.id }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!b) redirect("/coordinator/batches");
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <SetupStrip batchId={b.id} step="review" />
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review &amp; send to the OMC — {b.degreeProgram} {b.batchName}</h1>
      <BatchReviewView batchId={b.id} viewer={{ id: user.id, role: user.role }} s={1} base={`/coordinator/batches/review?batchId=${b.id}`} />
    </Shell>
  );
}
