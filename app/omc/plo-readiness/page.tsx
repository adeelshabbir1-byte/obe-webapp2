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

export default async function PloReadinessPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: { in: coordinatorIds }, status: "approved" },
    include: { batch: true, ploMappings: true },
    orderBy: [{ batchId: "asc" }, { number: "asc" }],
  });

  const rows = plos.map((p) => ({
    plo: p, courseCount: p.ploMappings.length,
    flag: p.ploMappings.length === 0 ? "unassigned" : p.ploMappings.length < 2 ? "thin" : "ok",
  }));

  const flagLabel: Record<string, { text: string; cls: string }> = {
    unassigned: { text: "Not Assigned to Any Course", cls: "badge-no" },
    thin: { text: "Only 1 Course — Thin Coverage", cls: "badge-warn" },
    ok: { text: "OK", cls: "badge-ok" },
  };

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Assignment Readiness</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Approved PLOs that aren't yet assigned to any course, or have too few contributing courses to be meaningfully measurable.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>PLO</th><th>Courses Assigned</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No approved PLOs yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.plo.id}>
                <td style={{ fontSize: 11.5 }}>{r.plo.batch ? `${r.plo.batch.degreeProgram} — ${r.plo.batch.batchName}` : "—"}</td>
                <td><b>PLO-{r.plo.number}</b>: {r.plo.title}</td><td>{r.courseCount}</td>
                <td><span className={`badge ${flagLabel[r.flag].cls}`}>{flagLabel[r.flag].text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
