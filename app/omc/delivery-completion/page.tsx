import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor, courseScopeFor } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";

export default async function DeliveryCompletionPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.delivery-completion"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  let courses = await prisma.course.findMany({
    where: { AND: [courseScopeFor(user), { isOffered: true, instructorId: { not: null } }] },
    include: { batch: true, instructor: true, lectureRows: { where: { source: "INSTRUCTOR" } } },
    orderBy: [{ code: "asc" }],
  });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

  const rows = courses.map((c) => {
    const total = c.lectureRows.length;
    const dated = c.lectureRows.filter((r) => r.actualDate).length;
    const pct = total > 0 ? Math.round((dated / total) * 100) : 0;
    return { course: c, dated, total, pct };
  });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Instructor Delivery Completion</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How much of the semester each instructor has actually logged, so falling behind is visible mid-semester.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Batch</th><th>Course</th><th>Instructor</th><th>Lectures Dated</th><th>% Complete</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No instructor-assigned courses yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.course.id} style={{ background: r.pct < 30 ? "#FFE8ED" : undefined }}>
                <td style={{ fontSize: 11.5 }}>{r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—"}</td>
                <td><b>{r.course.code}</b> {r.course.title}</td><td>{r.course.instructor?.name || "—"}</td>
                <td>{r.dated} / {r.total}</td>
                <td style={{ fontWeight: 600, color: r.pct < 30 ? "var(--rust)" : r.pct >= 80 ? "var(--sage)" : "var(--brass-dark)" }}>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
