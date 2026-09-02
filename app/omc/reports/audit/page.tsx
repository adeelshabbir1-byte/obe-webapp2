import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getAuditReport } from "../../../../lib/reports";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
  { href: "/omc/reports", label: "Reports" },
];

function flagBadge(flag: string) {
  if (flag === "orphan") return <span style={{ background: "#F5EAE5", color: "var(--rust)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 700 }}>Orphan — No PLO</span>;
  if (flag === "broad") return <span style={{ background: "#F4EFE1", color: "var(--brass-dark)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 700 }}>Overly Broad</span>;
  return <span style={{ background: "#E4EEE8", color: "var(--sage)", fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>OK</span>;
}

export default async function AuditReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const programs = await getAuditReport(user.managedById);

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>Course-Level Accreditation Audit & Orphan Detection</h1>
        <a href="/api/omc/reports/audit/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Flags orphan courses (mapped to zero PLOs) and overly broad courses (mapped to every single PLO indiscriminately) — both signal misconfiguration to accreditation panels.
      </p>
      <ReportsSubNav active="audit" />

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {programs.map((prog) => (
        <div key={prog.coordinatorName} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{prog.coordinatorName}'s Program</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: prog.orphanCount > 0 ? "var(--rust)" : "var(--sage)", fontFamily: "Georgia, serif" }}>{prog.orphanCount}</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>Orphan Courses</div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: prog.broadCount > 0 ? "var(--brass-dark)" : "var(--sage)", fontFamily: "Georgia, serif" }}>{prog.broadCount}</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>Overly Broad</div>
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Sem</th><th>PLOs Mapped</th><th>Flag</th></tr></thead>
              <tbody>
                {prog.rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
                {prog.rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code}</td><td>{r.title}</td><td>{r.courseType}</td><td>{r.semesterNumber ?? "—"}</td>
                    <td>{r.ploCount} / {r.totalPlos}</td><td>{flagBadge(r.flag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Shell>
  );
}
