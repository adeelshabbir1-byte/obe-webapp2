import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
  { href: "/omc/total-summary", label: "Total Summary" },
  { href: "/omc/weight-compliance", label: "Weight Compliance" },
  { href: "/omc/submission-timeliness", label: "Submission Timeliness" },
  { href: "/omc/delivery-completion", label: "Delivery Completion" },
  { href: "/omc/plo-readiness", label: "PLO Readiness" },
  { href: "/omc/section-utilization", label: "Section Utilization" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function WeightCompliancePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, weightExceptions: true },
    orderBy: [{ code: "asc" }],
  });
  const policies = await prisma.weightPolicy.findMany({ where: { chairmanId: user.managedById || "" } });
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
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Weight Policy Compliance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every offered course's weight compliance status, not just pending exceptions.
      </p>
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
