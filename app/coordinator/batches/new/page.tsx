import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import BatchSetupWizard from "../../../../components/BatchSetupWizard";

export const dynamic = "force-dynamic";

export default async function NewBatchPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const programs = await prisma.degreeProgram.findMany({ where: { coordinatorId: user.id }, orderBy: { name: "asc" }, select: { name: true, shortCode: true } });
  const existing = searchParams.batchId ? await prisma.batch.findFirst({ where: { id: searchParams.batchId, coordinatorId: user.id }, select: { id: true, degreeProgram: true, batchName: true, _count: { select: { courses: true } } } }) : null;
  if (existing && existing._count.courses > 0) redirect(`/coordinator/courses?batchId=${existing.id}`);
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{existing ? "Set up this batch's courses" : "New batch"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>One step at a time. The courses come from one source you choose — a curriculum or a previous batch — never a mix. Adjust them afterwards on the batch&apos;s courses page.</p>
      <BatchSetupWizard programs={programs} existing={existing ? { id: existing.id, degreeProgram: existing.degreeProgram, batchName: existing.batchName } : null} />
    </Shell>
  );
}
