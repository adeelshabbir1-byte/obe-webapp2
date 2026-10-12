import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { OVERVIEW_ROLES } from "../../lib/readinessScope";
import { riskRegister, type ProgramRow } from "../../lib/riskRegister";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SEV = { high: ["High", "badge-no"], medium: ["Medium", "badge-warn"], low: ["Low", "badge-neutral"] } as const;

function Cell({ n, href, bad = true }: { n: number; href: string; bad?: boolean }) {
  return <td style={{ textAlign: "center" }}>{n ? <Link href={href} style={{ color: bad ? "var(--rust)" : "#95650F", fontWeight: 700 }}>{n}</Link> : <span style={{ color: "var(--sage)" }}>0</span>}</td>;
}

export default async function RiskPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const { rows, risks, teachers, analysed } = await riskRegister(user);
  const high = risks.filter((r) => r.severity === "high").length;
  const level = (r: ProgramRow) => (r.score >= 40 ? ["High risk", "badge-no"] : r.score >= 12 ? ["Watch", "badge-warn"] : ["On track", "badge-ok"]);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Risk Register</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Every program on one screen: courses nobody owns, plans not ready, overdue work, results stuck, PLOs below target and teaching
        that doesn&apos;t match the plan — this term and the coming one. Highest risk first. Every number opens the page where it is fixed.
      </p>

      <div className="stat-grid">
        <div className={`stat ${high ? "stat-warn" : ""}`}><div style={{ fontSize: 26, fontWeight: 700, color: high ? "var(--rust)" : "var(--sage)" }}>{high}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>High risks</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{risks.filter((r) => r.severity === "medium").length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Medium risks</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{rows.filter((r) => r.score >= 40).length} / {rows.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Programs at high risk</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{teachers.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Teachers flagged in Planned vs Taught ({analysed} courses checked)</div></div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Programs</h3>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr>
            <th>Program</th><th>Risk</th><th style={{ textAlign: "center" }}>No Subject Expert</th><th style={{ textAlign: "center" }}>SE not accepted</th><th style={{ textAlign: "center" }}>No instructor</th>
            <th style={{ textAlign: "center" }}>Plans not submitted</th><th style={{ textAlign: "center" }}>Plans below OMC rules</th><th style={{ textAlign: "center" }}>Overdue deadlines</th>
            <th style={{ textAlign: "center" }}>Results stuck</th><th style={{ textAlign: "center" }}>Teaching flags</th><th>PLOs below 60%</th><th style={{ textAlign: "center" }}>Attendance stale</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={12} style={{ color: "var(--slate)" }}>No programs in your area.</td></tr>}
            {rows.map((r) => { const [t, c] = level(r); return (
              <tr key={r.id}>
                <td><b>{r.program}</b>{r.department && <div style={{ fontSize: 11, color: "var(--slate)" }}>{r.department}</div>}</td>
                <td><span className={`badge ${c}`}>{t}</span></td>
                <Cell n={r.noSe} href="/coordinator/assign-subject-experts" />
                <Cell n={r.seWaiting} href="/coordinator/assign-subject-experts" bad={false} />
                <Cell n={r.noInstructor} href="/coordinator/courses" />
                <Cell n={r.plansNotReady} href="/omc/templates" bad={false} />
                <Cell n={r.plansBelowOmc} href="/omc/templates" bad={false} />
                <Cell n={r.overdue} href="/semester-plan" />
                <Cell n={r.resultsPending} href="/results-approval" bad={false} />
                <Cell n={r.teachingFlags} href="/omc/reports/planned-vs-taught" bad={false} />
                <td style={{ color: r.ploLow.length ? "var(--rust)" : "var(--sage)", fontWeight: r.ploLow.length ? 700 : 400 }}>{r.ploLow.length ? <Link href="/omc/reports/attainment-analytics" style={{ color: "inherit" }}>{r.ploLow.join(", ")}</Link> : "none"}</td>
                <Cell n={r.attendanceStale} href="/omc/delivery-completion" bad={false} />
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Risks, highest first ({risks.length})</h3>
        {risks.length === 0 ? <p style={{ margin: 0, color: "var(--sage)" }}>Nothing to worry about right now.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {risks.slice(0, 60).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                <span className={`badge ${SEV[r.severity][1]}`} style={{ minWidth: 62, justifyContent: "center" }}>{SEV[r.severity][0]}</span>
                <span><b>{r.program}</b> · <span style={{ color: "var(--slate)" }}>{r.area}</span> — {r.text} <Link href={r.href}>Fix →</Link></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {teachers.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Teachers to talk to</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Courses where at least two topics were taught long but hardly assessed, or at least two planned topics were dropped (from Planned vs Taught).</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{teachers.map((t) => <li key={t.id}><b>{t.name}</b> — {t.courses.join(", ")}</li>)}</ul>
        </div>
      )}
    </Shell>
  );
}
