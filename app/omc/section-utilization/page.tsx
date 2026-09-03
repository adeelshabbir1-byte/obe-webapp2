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

export default async function SectionUtilizationPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    include: { members: { include: { course: { include: { batch: true } } } } },
  });

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
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Combined-Section Utilization</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How many sections combining equivalent courses is saving, versus teaching them all separately.
      </p>
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
        <table>
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
        </table>
      </div>
    </Shell>
  );
}
