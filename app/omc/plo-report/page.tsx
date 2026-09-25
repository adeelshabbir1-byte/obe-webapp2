import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import { courseTypeColor } from "../../../lib/courseTypeColors";



function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || "var(--ink)", fontFamily: "Georgia, serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default async function OmcPloReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" },
    orderBy: { name: "asc" },
  });

  const reportSections = [];
  const allTypesSeen = new Set<string>();

  for (const coord of coordinators) {
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    const rows = [];
    for (const p of plos) {
      const mappings = await prisma.coursePloMapping.findMany({ where: { ploId: p.id }, include: { course: true } });
      const byType: Record<string, number> = {};
      for (const m of mappings) {
        byType[m.course.courseType] = (byType[m.course.courseType] || 0) + 1;
        allTypesSeen.add(m.course.courseType);
      }
      rows.push({ number: p.number, title: p.title, status: p.status, count: mappings.length, byType });
    }
    const totalCourses = await prisma.course.count({ where: { coordinatorId: coord.id } });
    const max = Math.max(1, ...rows.map((r) => r.count));
    const notHit = rows.filter((r) => r.count === 0).length;
    const avg = rows.length ? (rows.reduce((s, r) => s + r.count, 0) / rows.length).toFixed(1) : "0";
    const approved = rows.filter((r) => r.status === "approved").length;

    reportSections.push({
      coordinatorName: coord.name, totalCourses, notHit, avg, approved, totalPlos: rows.length,
      rows: rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) })),
    });
  }

  const legendTypes = Array.from(allTypesSeen).sort();

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Coverage Report</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How many courses map to each PLO, broken down by course type — highlighting outcomes that are
        heavily covered versus not addressed anywhere.
      </p>

      {reportSections.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}

      {reportSections.map((sec) => (
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
              return (
                <div key={r.number} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #EEF2FA" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      PLO-{r.number}: {r.title}
                      {r.status !== "approved" && (
                        <span style={{ marginLeft: 8, fontSize: 9, textTransform: "uppercase", color: "var(--slate)", background: "#EEF2FA", padding: "1px 6px", borderRadius: 6 }}>
                          {r.status.replace("-", " ")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--slate)", flexShrink: 0 }}>
                      {r.count} course{r.count === 1 ? "" : "s"}
                      {r.count === 0 && <span style={{ marginLeft: 6, background: "#FFE8ED", color: "var(--rust)", fontSize: 9.5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 6, fontWeight: 700 }}>Not Hit</span>}
                    </div>
                  </div>

                  {/* Stacked bar: one segment per course type, width proportional to its share */}
                  <div style={{ display: "flex", height: 18, width: "100%", background: "#EEF2FA", overflow: "hidden" }}>
                    {typeEntries.map(([type, n]) => (
                      <div
                        key={type}
                        title={`${type}: ${n}`}
                        style={{ width: `${(n / Math.max(1, r.count)) * 100}%`, background: courseTypeColor(type) }}
                      />
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
                <span style={{ width: 10, height: 10, background: courseTypeColor(t), display: "inline-block", borderRadius: 6 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
