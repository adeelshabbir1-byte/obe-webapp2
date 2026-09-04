import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor, courseScopeFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";

export default async function WeightCompliancePage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  let courses = await prisma.course.findMany({
    where: { AND: [courseScopeFor(user), { isOffered: true }] },
    include: { batch: true, weightExceptions: true },
    orderBy: [{ code: "asc" }],
  });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);
  const policies = await prisma.weightPolicy.findMany({ where: { chairmanId: await chairmanIdFor(user) } });
  const policyByType = new Map(policies.map((p) => [p.courseType, p]));

  const rows = courses.map((c) => {
    const policy = policyByType.get(c.courseType);
    let status: "compliant" | "exception-approved" | "no-policy" | "unknown" = "no-policy";
    if (policy) {
      const withinRange =
        c.assignmentPct >= policy.assignmentMin && c.assignmentPct <= policy.assignmentMax &&
        c.quizPct >= policy.quizMin && c.quizPct <= policy.quizMax &&
        c.midtermPct >= policy.midtermMin && c.midtermPct <= policy.midtermMax &&
        c.finalPct >= policy.finalMin && c.finalPct <= policy.finalMax;
      const approvedException = c.weightExceptions.some((e) => e.status === "approved");
      status = withinRange ? "compliant" : approvedException ? "exception-approved" : "unknown";
    }
    return { course: c, status };
  });

  const labels: Record<string, { text: string; cls: string }> = {
    compliant: { text: "Within Policy", cls: "badge-ok" },
    "exception-approved": { text: "Exception Approved", cls: "badge-warn" },
    unknown: { text: "Out of Policy — No Exception", cls: "badge-no" },
    "no-policy": { text: "No Policy Set", cls: "badge-neutral" },
  };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Weight Policy Compliance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every offered course's weight compliance status, not just pending exceptions.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>Course</th><th>Type</th><th>Weights</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.course.id}>
                <td style={{ fontSize: 11.5 }}>{r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—"}</td>
                <td><b>{r.course.code}</b> {r.course.title}</td><td>{r.course.courseType}</td>
                <td style={{ fontSize: 11 }}>A{r.course.assignmentPct} Q{r.course.quizPct} P{r.course.projectPct} L{r.course.labPct} M{r.course.midtermPct} F{r.course.finalPct}</td>
                <td><span className={`badge ${labels[r.status].cls}`}>{labels[r.status].text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
