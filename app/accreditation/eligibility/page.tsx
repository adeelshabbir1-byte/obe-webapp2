import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import EligibilityInput from "../../../components/EligibilityInput";
import { eligibility } from "../../../lib/councilEligibility";
import { sarScope } from "../../../lib/sarAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "Council eligibility" };
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];
const RES = { true: ["Met", "#23894f", "rgba(46,157,91,.16)"], false: ["Not met", "#c93c3c", "rgba(214,69,69,.14)"], null: ["To answer", "#c98a0b", "rgba(224,165,38,.16)"] } as const;

// Can each NBEAC / PEC program apply to its council yet? Checked from the system, with the few facts it can't know typed in.
export default async function EligibilityPage({ searchParams }: { searchParams: { program?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLES.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const scope = await sarScope(user);
  const filter = user.role === "CHAIRMAN" ? {} : user.role === "PROGRAM_COORDINATOR" ? { program: user.leadProgram || "__none" } : { departments: scope.departments.map((d) => d.id) };
  const rows = await eligibility(chairmanId, filter).catch((e) => { console.error("eligibility", e); return []; });
  const sel = rows.find((r) => r.program === searchParams.program) || rows[0] || null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Council Eligibility</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            Before applying, NBEAC screens eligibility (charter, 60% business credit hours, traditional delivery, three graduated batches) and PEC checks the
            program against its Manual of Accreditation 2019 (credit hours, final-year project, 25 : 1 ratio, 8 dedicated faculty, class size, lab manuals).
            Most of it is read from OBEHUB; answer the rest here, then download the sheet for the application.
          </p>
        </div>
        <a href="/api/accreditation/eligibility?sheet=1" className="btn btn-brass btn-sm">Download all (Excel)</a>
      </div>
      {rows.length === 0 && <div className="card" style={{ marginTop: 12 }}><p className="small-note" style={{ margin: 0 }}>No program here is bound to NBEAC or PEC. Bind programs to their council under Visit readiness › Programs, councils &amp; standards.</p></div>}
      {rows.length > 0 && (
        <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0 0" }}>
          {rows.map((r) => {
            const tone = r.failed ? RES.false : r.open ? RES.null : RES.true;
            const on = r.program === sel?.program;
            return (
              <Link key={r.body + r.program} href={`/accreditation/eligibility?program=${encodeURIComponent(r.program)}`} role="tab" aria-selected={on}
                style={{ textDecoration: "none", color: "inherit", border: `1px solid ${tone[1]}66`, background: on ? tone[2] : "transparent", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: on ? 700 : 500 }}>
                <span style={{ color: tone[1] }}>●</span> {r.program} <span className="small-note">{r.body} · {r.passed}/{r.checks.length}</span>
              </Link>
            );
          })}
        </div>
      )}
      {sel && (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <b>{sel.program} — {sel.body}: {sel.failed ? `${sel.failed} requirement${sel.failed > 1 ? "s" : ""} not met` : sel.open ? `${sel.open} to answer` : "eligible on every check"}</b>
              <a href={`/api/accreditation/eligibility?sheet=1&program=${encodeURIComponent(sel.program)}`} className="btn btn-secondary btn-sm">Download this program</a>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(sel.facts).map(([k, v]) => <span key={k} className="small-note"><b style={{ color: "var(--ink, inherit)" }}>{v}</b> {k.toLowerCase()}</span>)}
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 13 }}>
              <thead><tr><th>Requirement</th><th>Rule</th><th>In OBEHUB</th><th>Result</th><th>Answer / override</th></tr></thead>
              <tbody>
                {sel.checks.map((c) => {
                  const r = RES[String(c.pass) as "true" | "false" | "null"];
                  return (
                    <tr key={c.key + c.label}>
                      <td><b>{c.label}</b></td>
                      <td style={{ maxWidth: 320 }}>{c.rule}</td>
                      <td style={{ maxWidth: 320 }}>{c.value || "—"}{c.note && <div className="small-note">{c.note}</div>}</td>
                      <td><span style={{ color: r[1], background: r[2], borderRadius: 999, padding: "1px 9px", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{r[0]}</span>{c.source === "entered" && <div className="small-note">entered</div>}</td>
                      <td>{c.input ? <EligibilityInput body={sel.body} program={sel.program} k={c.key} kind={c.input.kind} options={c.input.options} value={c.raw || ""} /> : <span className="small-note">from the system</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small-note">Sources: NBEAC eligibility criteria (nbeac.org.pk › Accreditation); PEC Manual of Accreditation 2019, Sec. 1.8 and 3.2. Councils revise their rules — check the current documents before applying.</p>
        </>
      )}
    </Shell>
  );
}
