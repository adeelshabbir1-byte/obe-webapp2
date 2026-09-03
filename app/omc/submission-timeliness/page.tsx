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

export default async function SubmissionTimelinessPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, subjectExpert: true },
    orderBy: [{ code: "asc" }],
  });

  const statusLabel: Record<string, { text: string; cls: string }> = {
    draft: { text: "Not Submitted", cls: "badge-no" },
    submitted: { text: "Submitted, Pending Review", cls: "badge-warn" },
    approved: { text: "Approved", cls: "badge-ok" },
    "changes-requested": { text: "Changes Requested", cls: "badge-warn" },
  };

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Submission Timeliness</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Which Subject Experts have submitted their template, and which haven't yet.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>Course</th><th>Subject Expert</th><th>Status</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No offered courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td><b>{c.code}</b> {c.title}</td><td>{c.subjectExpert?.name || <span style={{ color: "var(--slate)" }}>Unassigned</span>}</td>
                <td><span className={`badge ${statusLabel[c.templateStatus]?.cls || "badge-neutral"}`}>{statusLabel[c.templateStatus]?.text || c.templateStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
