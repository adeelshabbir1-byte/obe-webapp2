import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";

export default async function SectionUtilizationPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.section-utilization"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  let groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: await chairmanIdFor(user) },
    include: { members: { include: { course: { include: { batch: true } } } } },
  });
  if (searchParams.batchId) groups = groups.filter((g) => g.members.some((m) => m.course.batchId === searchParams.batchId));
  else if (searchParams.degree) groups = groups.filter((g) => g.members.some((m) => m.course.batch?.degreeProgram === searchParams.degree));

  const standaloneOffered = await prisma.course.count({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true, equivalenceMember: null },
  });

  const groupRows = groups.map((g) => {
    const totalStudents = g.members.reduce((s, m) => s + (m.course.batch?.studentCount || 0), 0);
    const combinedSections = Math.max(1, Math.ceil(totalStudents / 50));
    const separateSections = g.members.reduce((s, m) => s + Math.max(1, Math.ceil((m.course.batch?.studentCount || 0) / 50)), 0);
    return { group: g, totalStudents, combinedSections, separateSections, saved: separateSections - combinedSections };
  });

  const totalSaved = groupRows.reduce((s, r) => s + Math.max(0, r.saved), 0);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Combined-Section Utilization</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How many sections combining equivalent courses is saving, versus teaching them all separately.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 150 }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{groups.length}</div>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>Equivalence Groups</div>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 150 }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif", color: "var(--sage)" }}>{totalSaved}</div>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>Sections Saved Overall</div>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 150 }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{standaloneOffered}</div>
            <div style={{ fontSize: 11, color: "var(--slate)" }}>Standalone Offered Courses</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Group</th><th>Member Courses</th><th>Combined Students</th><th>Sections If Combined</th><th>Sections If Separate</th><th>Sections Saved</th></tr></thead>
          <tbody>
            {groupRows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No equivalence groups yet.</td></tr>}
            {groupRows.map((r) => (
              <tr key={r.group.id}>
                <td>{r.group.name}</td>
                <td style={{ fontSize: 11.5 }}>{r.group.members.map((m) => `${m.course.code} (${m.course.batch?.batchName || "—"})`).join(", ")}</td>
                <td>{r.totalStudents}</td><td>{r.combinedSections}</td><td>{r.separateSections}</td>
                <td style={{ fontWeight: 600, color: r.saved > 0 ? "var(--sage)" : "var(--slate)" }}>{r.saved > 0 ? r.saved : "—"}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
