import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";
import ContentSyncManager from "../../../components/ContentSyncManager";
import SetupStrip from "../../../components/SetupStrip";
import SetupSyncPanel from "../../../components/SetupSyncPanel";
import { setupStatus } from "../../../lib/batchSetup";
import { stepHref } from "../../../lib/batchFlow";

export const dynamic = "force-dynamic";

// The OMC's Content Sync page. A Program Lead uses it too, for their own batches: step 5 of a batch's set-up
// (?batchId=&setup=) loads the batch and the program's earlier batches, with the set-up strip and the "new course" panel.
export default async function ContentSyncPage({ searchParams }: { searchParams: { batchId?: string; setup?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC" && user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const isLead = user.role === "PROGRAM_COORDINATOR";
  const batch = searchParams.batchId ? await prisma.batch.findUnique({ where: { id: searchParams.batchId }, select: { id: true, degreeProgram: true, coordinatorId: true, createdAt: true } }) : null;
  const own = !!batch && (!isLead || batch.coordinatorId === user.id);
  let panel: React.ReactNode = null;
  if (batch && own) {
    const st = await setupStatus(batch.id);
    const earlier = await prisma.batch.findMany({ where: { coordinatorId: batch.coordinatorId, degreeProgram: batch.degreeProgram, id: { not: batch.id }, createdAt: { lt: batch.createdAt } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true } });
    const rows = st?.rows || [];
    panel = (
      <SetupSyncPanel batchId={batch.id} preselect={[batch.id, ...earlier.map((b) => b.id)]} synced={rows.filter((r) => r.matched).length} total={rows.length} isNew={rows.filter((r) => r.isNew).length}
        open={rows.filter((r) => !r.matched && !r.isNew).map((r) => ({ id: r.id, code: r.code, title: r.title, suggestion: r.suggestion }))} back={stepHref(6, batch.id)} />
    );
  }
  return (
    <Shell roleLabel={isLead ? "Program Lead" : "OMC Member"} userName={user.name} navLinks={isLead ? navForRole(user.role) : OMC_ACTION_NAV}>
      {batch && own && isLead && searchParams.setup && <SetupStrip batchId={batch.id} step={5} />}
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Content Sync</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Link courses so a Subject Expert&apos;s saved changes propagate automatically, going forward — separate from
        Course Equivalence (combined teaching), though linked courses offered in the same term are combined
        automatically too.{isLead ? " You see your own batches; the OMC sees every batch of the department." : ""}
      </p>
      {isLead && !batch && <p className="small-note">Open this page from a batch&apos;s set-up (step 5) to start with that batch and the ones before it.</p>}
      {panel || <ContentSyncManager />}
    </Shell>
  );
}
