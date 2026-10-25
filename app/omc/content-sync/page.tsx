import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";
import ContentSyncManager from "../../../components/ContentSyncManager";
import SetupStrip from "../../../components/SetupStrip";

// Content Sync — the OMC's page, and the Program Lead's "Sync & equalise" step for his own batch (?setup=<batchId>):
// the new batch and the program's earlier batches are selected, so each course can be linked to the one taught before.
export default async function ContentSyncPage({ searchParams }: { searchParams: { setup?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC" && user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const lead = user.role === "PROGRAM_COORDINATOR";
  const setupBatch = searchParams.setup ? await prisma.batch.findFirst({ where: { id: searchParams.setup, ...(lead ? { coordinatorId: user.id } : {}) }, select: { id: true, degreeProgram: true, coordinatorId: true } }) : null;
  const earlier = setupBatch ? await prisma.batch.findMany({ where: { coordinatorId: setupBatch.coordinatorId, degreeProgram: setupBatch.degreeProgram, id: { not: setupBatch.id } }, orderBy: [{ startYear: "desc" }], take: 3, select: { id: true } }) : [];
  return (
    <Shell roleLabel={lead ? "Program Lead" : "OMC Member"} userName={user.name} navLinks={lead ? navForRole(user.role) : OMC_ACTION_NAV}>
      {setupBatch && <SetupStrip batchId={setupBatch.id} step="sync" />}
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Content Sync</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Link courses so a Subject Expert&apos;s saved changes propagate automatically, going forward — separate from
        Course Equivalence (combined teaching), though linked courses offered in the same term are combined
        automatically too.{setupBatch ? " For a new batch: link each course to the same course taught in an earlier batch — it then takes that course's semester, home department and Subject Expert. A course with no earlier course is a new course (mark them on the batch's courses page)." : ""}
      </p>
      <ContentSyncManager initialBatchIds={setupBatch ? [setupBatch.id, ...earlier.map((b) => b.id)] : []} />
      {setupBatch && <p style={{ marginTop: 12 }}><a className="btn" href={`/coordinator/courses?batchId=${setupBatch.id}`}>Back to the batch set-up →</a></p>}
    </Shell>
  );
}
