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

export default async function DeliveryCompletionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: { not: null } },
    include: { batch: true, instructor: true, lectureRows: { where: { source: "INSTRUCTOR" } } },
    orderBy: [{ code: "asc" }],
  });

  const rows = courses.map((c) => {
    const total = c.lectureRows.length;
    const dated = c.lectureRows.filter((r) => r.actualDate).length;
    const pct = total > 0 ? Math.round((dated / total) * 100) : 0;
    return { course: c, dated, total, pct };
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Instructor Delivery Completion</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How much of the semester each instructor has actually logged, so falling behind is visible mid-semester.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>Course</th><th>Instructor</th><th>Lectures Dated</th><th>% Complete</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No instructor-assigned courses yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.course.id} style={{ background: r.pct < 30 ? "#FFE4DC" : undefined }}>
                <td style={{ fontSize: 11.5 }}>{r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—"}</td>
                <td><b>{r.course.code}</b> {r.course.title}</td><td>{r.course.instructor?.name || "—"}</td>
                <td>{r.dated} / {r.total}</td>
                <td style={{ fontWeight: 600, color: r.pct < 30 ? "var(--rust)" : r.pct >= 80 ? "var(--sage)" : "var(--brass-dark)" }}>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
