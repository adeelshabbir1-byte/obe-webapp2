import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { computeReadiness, rate } from "../../lib/readiness";
import { OVERVIEW_ROLES, leadsInScope } from "../../lib/readinessScope";

const SHORT: Record<number, string> = { 1: "Admission", 2: "Students", 3: "PEOs", 4: "PLOs", 5: "Curriculum", 6: "Learning Process", 7: "Faculty", 8: "Infrastructure", 9: "Industrial Linkages", 10: "Institutional Support" };
const LABEL: Record<string, string> = { CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator" };

export default async function AccreditationOverviewPage({ searchParams }: { searchParams: { all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");

  const { chairmanId, leads } = await leadsInScope(user);
  // One program at a time: each report already runs many queries, and the database pool is small.
  const rows: { l: (typeof leads)[number]; d: Awaited<ReturnType<typeof computeReadiness>>; weakest: { a: { no: number; title: string }; s: number | null } | undefined }[] = [];
  const compareAll = searchParams.all === "1";
  for (const l of compareAll ? leads.slice(0, 40) : []) {
    const d = await computeReadiness({ id: l.id, managedById: chairmanId, departmentId: l.departmentId }, "");
    const weakest = d.scored.filter((x) => x.s !== null).sort((a, b) => (a.s as number) - (b.s as number))[0];
    rows.push({ l, d, weakest });
  }
  const withScore = rows.filter((r) => r.d.overall !== null);
  const avg = withScore.length ? Math.round(withScore.reduce((n, r) => n + (r.d.overall as number), 0) / withScore.length) : null;
  const needAttention = withScore.filter((r) => (r.d.overall as number) < 60).length;
  const criteria = rows[0]?.d.areas || [];

  return (
    <Shell roleLabel={LABEL[user.role] || "Overview"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Overview</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Visit preparation for every program, side by side. Each cell is one NCEAC criterion: the letter is the rating (E Exceptional, G Good, C Concern, W Weakness, D Deficient, X not measured here) and the number is the score.
        Click a program for its full report and the list of what to fix.
      </p>
      {!compareAll && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Choose a program</h3>
          {leads.length === 0 ? <p style={{ color: "var(--slate)" }}>No Program Leads in your area yet.</p> : (
            <table>
              <thead><tr><th>Program</th><th>Department</th><th>Program Lead</th><th></th></tr></thead>
              <tbody>{leads.map((l) => (
                <tr key={l.id}><td><b>{l.leadProgram || "Program"}</b></td><td>{l.department_?.name || "—"}</td><td>{l.name}</td>
                  <td><a className="btn" style={{ fontSize: 12 }} href={`/accreditation-overview/${l.id}`}>View readiness</a></td></tr>
              ))}</tbody>
            </table>
          )}
          {leads.length > 1 && <p style={{ marginTop: 12 }}><a className="btn" href="/accreditation-overview?all=1">Compare all programs side by side</a> <span style={{ fontSize: 12, color: "var(--slate)" }}>(slower: checks every program)</span></p>}
        </div>
      )}
      {compareAll && <a className="btn" href="/accreditation-overview" style={{ marginBottom: 10, display: "inline-block" }}>← Back to program list</a>}
      {compareAll && (<>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Programs", rows.length], ["Average readiness", avg === null ? "—" : `${avg}%`], ["Below 60% (need attention)", needAttention]].map(([l, v]) => (
          <div key={String(l)} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 150 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif", color: l === "Below 60% (need attention)" && needAttention > 0 ? "#B3261E" : undefined }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p style={{ color: "var(--slate)" }}>No Program Leads in your area yet.</p> : (
          <table>
            <thead><tr>
              <th>Program</th><th>Overall</th>
              {criteria.map((c) => (
                <th key={c.no} title={`${c.no}. ${c.title}`} style={{ textAlign: "center", verticalAlign: "bottom", padding: "6px 2px" }}>
                  <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", fontSize: 12, display: "inline-block" }}>{SHORT[c.no] || c.title}</span>
                </th>
              ))}
              <th>Weakest area</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(({ l, d, weakest }) => {
                const ov = rate(d.overall);
                return (
                  <tr key={l.id}>
                    <td><b>{l.leadProgram || "Program"}</b><div style={{ fontSize: 12, color: "var(--slate)" }}>{l.department_?.name || "—"} · {l.name}</div></td>
                    <td style={{ minWidth: 110 }}>
                      <b style={{ color: ov.colour }}>{d.overall === null ? "—" : `${d.overall}%`}</b>
                      <div style={{ background: "#ECE8E0", borderRadius: 6, height: 8, marginTop: 3 }}><div style={{ width: `${d.overall ?? 0}%`, height: "100%", background: ov.colour, borderRadius: 6 }} /></div>
                    </td>
                    {d.scored.map(({ a, s }) => { const r = rate(s); return (
                      <td key={a.no} style={{ textAlign: "center" }} title={`${a.no}. ${a.title}: ${s === null ? "not measured" : `${s}% (${r.name})`}`}>
                        <span style={{ display: "inline-block", minWidth: 30, background: r.colour, color: "#fff", borderRadius: 5, padding: "2px 4px", fontSize: 12, fontWeight: 700 }}>{r.code}</span>
                        <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{s === null ? "" : s}</div>
                      </td>
                    ); })}
                    <td style={{ fontSize: 12 }}>{weakest ? `${weakest.a.no}. ${weakest.a.title} (${weakest.s}%)` : "—"}</td>
                    <td><a className="btn" style={{ fontSize: 12 }} href={`/accreditation-overview/${l.id}`}>Open</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {criteria.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--slate)" }}>
            {criteria.map((c) => <span key={c.no} style={{ marginRight: 14, display: "inline-block" }}><b>{c.no}</b> {c.title}</span>)}
          </div>
        )}
      </div>
      </>)}
    </Shell>
  );
}
