import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../../components/reportNav";
import BatchReviewView from "../../../../components/BatchReviewView";

export default async function OmcBatchReview({ params, searchParams }: { params: { batchId: string }; searchParams: { s?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const b = await prisma.batch.findFirst({ where: { id: params.batchId, coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!b) redirect("/omc/batch-review");
  return (
    <Shell roleLabel={user.role === "OMC" ? "OMC Member" : "Faculty"} userName={user.name} navLinks={user.role === "OMC" ? OMC_ACTION_NAV : navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Batch approval — {b.degreeProgram} {b.batchName}</h1>
      <BatchReviewView batchId={b.id} viewer={{ id: user.id, role: user.role }} s={Number(searchParams.s || 1)} base={`/omc/batch-review/${b.id}`} />
    </Shell>
  );
}
