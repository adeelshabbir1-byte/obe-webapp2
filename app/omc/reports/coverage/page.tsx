import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getCoverageReport } from "../../../../lib/reports";
import { courseTypeColor } from "../../../../lib/courseTypeColors";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/reports", label: "Reports" },
];

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || "var(--ink)", fontFamily: "Georgia, serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default async function CoverageReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const programs = await getCoverageReport(user.managedById);
  const legendTypes = Array.from(new Set(programs.flatMap((p) => p.rows.flatMap((r) => Object.keys(r.byType))))).sort();

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>Program-Level PLO Coverage & Distribution Summary</h1>
        <a href="/api/omc/reports/coverage/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        How comprehensively the program addresses each PLO — highlighting coverage gaps where a PLO is under-mapped.
      </p>
      <ReportsSubNav active="coverage" />

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {programs.map((sec) => (
        <div key={sec.coordinatorName} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{sec.coordinatorName}'s Program</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <StatCard label="PLOs Defined" value={sec.totalPlos} />
            <StatCard label="PLOs Approved" value={sec.approved} tone="var(--sage)" />
            <StatCard label="Courses in Program" value={sec.totalCourses} />
            <StatCard label="Avg Courses / PLO" value={sec.avg} />
            <StatCard label="PLOs Not Hit" value={sec.notHit} tone={sec.notHit > 0 ? "var(--rust)" : "var(--sage)"} />
          </div>
          <div className="card">
            {sec.rows.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No PLOs defined.</p>}
            {sec.rows.map((r) => {
              const typeEntries = Object.entries(r.byType);
              const max = Math.max(1, ...sec.rows.map((x) => x.count));
              return (
                <div key={r.number} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #EFEADC" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      PLO-{r.number}: {r.title}
                      {r.status !== "approved" && (
                        <span style={{ marginLeft: 8, fontSize: 9, textTransform: "uppercase", color: "var(--slate)", background: "#EFECE3", padding: "1px 6px", borderRadius: 2 }}>{r.status.replace("-", " ")}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--slate)", flexShrink: 0 }}>
                      {r.count} course{r.count === 1 ? "" : "s"}
                      {r.count === 0 && <span style={{ marginLeft: 6, background: "#F5EAE5", color: "var(--rust)", fontSize: 9.5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 2, fontWeight: 700 }}>Not Hit</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", height: 18, width: "100%", background: "#EFEADC", overflow: "hidden" }}>
                    {typeEntries.map(([type, n]) => (
                      <div key={type} title={`${type}: ${n}`} style={{ width: `${(n / Math.max(1, r.count)) * 100}%`, background: courseTypeColor(type) }} />
                    ))}
                  </div>
                  {typeEntries.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {typeEntries.map(([type, n]) => (
                        <span key={type} style={{ fontSize: 10.5, color: "var(--slate)", display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 8, height: 8, background: courseTypeColor(type), display: "inline-block", borderRadius: 1 }} />
                          {type}: {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {legendTypes.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 12.5, marginBottom: 10, color: "var(--slate)" }}>Course Type Legend</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {legendTypes.map((t) => (
              <span key={t} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: courseTypeColor(t), display: "inline-block", borderRadius: 2 }} />{t}
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
