import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getBloomReport, BLOOM_ORDER, BLOOM_LABELS } from "../../../../lib/reports";
import Shell from "../../../../components/Shell";
import ReportsSubNav from "../../../../components/ReportsSubNav";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/reports", label: "Reports" },
];

const BLOOM_COLORS: Record<string, string> = {
  C1: "#8B8571", C2: "#5B7C99", C3: "#4B8F87", C4: "#4B7A63", C5: "#A8823C", C6: "#B1512E",
};

export default async function BloomReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const programs = await getBloomReport(user.managedById);

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22 }}>CLO Bloom's Taxonomy Distribution</h1>
        <a href="/api/omc/reports/bloom/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Whether higher-order thinking (Analyze / Evaluate / Create) is adequately represented as students progress through the program.
      </p>
      <ReportsSubNav active="bloom" />

      {programs.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {programs.map((prog) => {
        const semesters = Object.keys(prog.bySemester).map(Number).filter((s) => s > 0).sort((a, b) => a - b);
        return (
          <div key={prog.coordinatorName} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>{prog.coordinatorName}'s Program</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{prog.totalClos}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Total CLOs</div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: prog.higherOrderPct >= 30 ? "var(--sage)" : "var(--rust)", fontFamily: "Georgia, serif" }}>{prog.higherOrderPct}%</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Higher-Order (C4–C6)</div>
              </div>
            </div>

            <div className="card">
              <h4 style={{ fontSize: 12.5, marginBottom: 10, color: "var(--slate)" }}>Overall Distribution</h4>
              <div style={{ display: "flex", height: 22, width: "100%", overflow: "hidden", marginBottom: 8 }}>
                {BLOOM_ORDER.map((b) => {
                  const n = prog.overall[b] || 0;
                  const pct = prog.totalClos ? (n / prog.totalClos) * 100 : 0;
                  return pct > 0 ? <div key={b} title={`${BLOOM_LABELS[b]}: ${n}`} style={{ width: `${pct}%`, background: BLOOM_COLORS[b] }} /> : null;
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {BLOOM_ORDER.map((b) => (
                  <span key={b} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, background: BLOOM_COLORS[b], display: "inline-block", borderRadius: 2 }} />
                    {b} {BLOOM_LABELS[b]}: {prog.overall[b] || 0}
                  </span>
                ))}
              </div>
            </div>

            {semesters.length > 0 && (
              <div className="card" style={{ overflowX: "auto" }}>
                <h4 style={{ fontSize: 12.5, marginBottom: 10, color: "var(--slate)" }}>By Semester</h4>
                <table>
                  <thead><tr><th>Semester</th>{BLOOM_ORDER.map((b) => <th key={b} style={{ textAlign: "center" }}>{b}</th>)}</tr></thead>
                  <tbody>
                    {semesters.map((s) => (
                      <tr key={s}>
                        <td>Sem {s}</td>
                        {BLOOM_ORDER.map((b) => <td key={b} style={{ textAlign: "center" }}>{prog.bySemester[s]?.[b] || 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </Shell>
  );
}
