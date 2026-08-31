import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/plo-report", label: "PLO Coverage Report" },
];

export default async function OmcPloReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" },
    orderBy: { name: "asc" },
  });

  const reportSections = [];
  for (const coord of coordinators) {
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    const counts: Record<string, number> = {};
    for (const p of plos) {
      counts[p.id] = await prisma.coursePloMapping.count({ where: { ploId: p.id } });
    }
    const totalCourses = await prisma.course.count({ where: { coordinatorId: coord.id } });
    const max = Math.max(1, ...Object.values(counts));
    reportSections.push({ coordinatorName: coord.name, totalCourses, rows: plos.map((p) => ({ number: p.number, title: p.title, count: counts[p.id] || 0, pct: Math.round(((counts[p.id] || 0) / max) * 100) })) });
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Coverage Report</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        How many courses map to each PLO — highlighting outcomes that are heavily covered versus not addressed anywhere.
      </p>
      {reportSections.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs yet.</p></div>}
      {reportSections.map((sec) => (
        <div className="card" key={sec.coordinatorName}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>{sec.coordinatorName}'s Program</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 14 }}>{sec.totalCourses} course(s) total</p>
          {sec.rows.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No PLOs defined.</p>}
          {sec.rows.map((r) => (
            <div key={r.number} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <div style={{ width: 200, fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>PLO-{r.number}: {r.title}</div>
              <div style={{ flex: 1, height: 14, background: "#EFEADC", position: "relative" }}>
                <div style={{ height: "100%", width: `${r.pct}%`, background: "var(--brass)" }} />
              </div>
              <div style={{ width: 130, textAlign: "right", fontSize: 11.5, color: "var(--slate)", flexShrink: 0 }}>
                {r.count} course{r.count === 1 ? "" : "s"}
                {r.count === 0 && <span style={{ marginLeft: 6, background: "#F5EAE5", color: "var(--rust)", fontSize: 9.5, textTransform: "uppercase", padding: "1px 6px", borderRadius: 2, fontWeight: 700 }}>Not Hit</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </Shell>
  );
}
