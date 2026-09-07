import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor, courseScopeFor } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";

export default async function SubmissionTimelinessPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.submission-timeliness"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  let courses = await prisma.course.findMany({
    where: { ...courseScopeFor(user), isOffered: true },
    include: { batch: true, subjectExpert: true },
    orderBy: [{ code: "asc" }],
  });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

  const statusLabel: Record<string, { text: string; cls: string }> = {
    draft: { text: "Not Submitted", cls: "badge-no" },
    submitted: { text: "Submitted, Pending Review", cls: "badge-warn" },
    approved: { text: "Approved", cls: "badge-ok" },
    "changes-requested": { text: "Changes Requested", cls: "badge-warn" },
  };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Submission Timeliness</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Which Subject Experts have submitted their template, and which haven't yet.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
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
        </SortableTable>
      </div>
    </Shell>
  );
}
