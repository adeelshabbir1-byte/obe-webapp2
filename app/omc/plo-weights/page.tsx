import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import { deptScope } from "../../../lib/omcScope";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";
import PloWeightEditor from "../../../components/PloWeightEditor";
import { batchPloWeights } from "../../../lib/ploWeights";
import { TARGET_PCT } from "../../../lib/ploWeightMath";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PloWeightsPage({ searchParams }: { searchParams: { batchId?: string; degree?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "OMC") redirect("/dashboard");
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) }, select: { id: true } })).map((c) => c.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const batch = batches.find((b) => b.id === searchParams.batchId) || null;
  const data = batch ? await batchPloWeights(batch.id, true) : null;
  const target = TARGET_PCT;

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA Weights</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How much each course counts toward each GA of a batch. By default the courses mapped to a GA share it equally (3 courses: 33.33% each).
        <b> Use suggestion</b> follows the institute&apos;s rule: computing courses weigh more on the technical GAs 1–5, General Education / IDS courses
        weigh more on the soft-skill GAs 6–10, a capstone / FYP counts on both, and longer courses (more credit hours) count more. They can still overlap;
        the weights for a GA must total 100%. The batch&apos;s GA attainment is the weighted average of its courses&apos; results.
        Which courses serve a GA is set on the GA–Course Matrix.
      </p>
      <div className="card no-print"><DegreeBatchFilter batches={batches} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} /></div>
      {!batch && <div className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>Choose a batch above.</p></div>}
      {data?.missing && <div className="err">The GA weight table is not in the database yet — run prisma/migration_plo_weights.sql (or the System Health fix script) in Supabase. Until then every GA uses the suggested split.</div>}
      {data && data.plos.length === 0 && <div className="card"><p style={{ margin: 0 }}>This batch has no GAs yet.</p></div>}
      {data?.plos.map((p) => <PloWeightEditor key={p.id + p.state + p.courses.map((c) => c.weight).join(",")} plo={p} target={target} />)}
    </Shell>
  );
}
