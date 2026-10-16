import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import NarrativeEditor from "../../../components/sar/NarrativeEditor";
import { sarScope } from "../../../lib/sarAccess";
import { buildNbeacSar, progress, type Item } from "../../../lib/nbeacSar";

export const dynamic = "force-dynamic";
export const metadata = { title: "NBEAC SAR" };
const BUILDERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const WRITERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
const BADGE: Record<string, [string, string]> = { filled: ["Filled", "badge-ok"], missing: ["Missing", "badge-no"], restricted: ["Confidential", "badge-neutral"] };

function ItemView({ it, scopeKey, canWrite }: { it: Item; scopeKey: string; canWrite: boolean }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div><b>{it.code}</b> <span style={{ fontSize: 13 }}>{it.question}</span> <span className={`badge ${BADGE[it.status][1]}`} style={{ marginLeft: 4 }}>{BADGE[it.status][0]}</span></div>
        {it.fill && it.status !== "restricted" && <Link href={it.fill} className="small-note">Fill in →</Link>}
      </div>
      {it.note && <p className="small-note" style={{ margin: "4px 0 0" }}>{it.note}</p>}
      <div style={{ marginTop: 6 }}>
        {it.kind === "narrative" && <NarrativeEditor scopeKey={scopeKey} code={it.code} initial={it.text || ""} canEdit={canWrite} />}
        {it.kind === "appendix" && (it.files?.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{it.files.map((f) => <li key={f.id}>{f.fileName ? <a href={`/api/accreditation?file=${f.id}`}>{f.title}</a> : f.title}{f.approvedBy ? ` — approved by ${f.approvedBy}` : ""}{f.date ? `, ${f.date}` : ""}{!f.fileName && <span className="small-note"> (no document attached)</span>}</li>)}</ul>
        ) : <p className="small-note" style={{ margin: 0 }}>No approved document recorded under Policies & manuals for this appendix.</p>)}
        {it.kind === "table" && it.rows && it.rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr>{it.columns!.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>{it.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ whiteSpace: typeof c === "string" && c.length > 60 ? "pre-wrap" : undefined }}>{c === null || c === "" ? "—" : String(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// The NBEAC Self-Assessment Report for a business school, assembled from the system, with the written answers.
export default async function NbeacSarPage({ searchParams }: { searchParams: { dept?: string; form?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!BUILDERS.includes(user.role)) redirect("/accreditation");
  const scope = await sarScope(user);
  const dept = scope.departments.find((d) => d.id === searchParams.dept) || scope.departments[0] || null;
  let failed = false;
  const doc = dept ? await buildNbeacSar(user, scope, dept.id).catch((e) => { console.error("nbeac sar", e); failed = true; return null; }) : null;
  const prog = doc ? progress(doc) : [];
  const all = prog.reduce((a, p) => ({ filled: a.filled + p.filled, total: a.total + p.total }), { filled: 0, total: 0 });
  const canWrite = WRITERS.includes(user.role);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>NBEAC Self-Assessment Report</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            SAR 4.0 for {doc?.school || "the business school"}, filled from the system. Tables update as the data is kept; write the descriptive answers here.
            Download it as Word to finish, sign and send to NBEAC.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/accreditation" className="btn btn-secondary btn-sm">Accreditation data</Link>
          {doc && <a href={`/api/accreditation/nbeac-word?dept=${dept!.id}`} className="btn btn-brass btn-sm">Download Word</a>}
        </div>
      </div>
      {scope.departments.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
          <span className="small-note">Business school:</span>
          {scope.departments.map((d) => <Link key={d.id} href={`/accreditation/nbeac?dept=${d.id}`} className={`btn btn-sm ${d.id === dept?.id ? "btn-brass" : "btn-secondary"}`}>{d.name}</Link>)}
        </div>
      )}
      {!dept && <div className="card"><p className="small-note" style={{ margin: 0 }}>No department to report on.</p></div>}
      {failed && <div className="err">The SAR could not be put together — run prisma/migration_nbeac_sar.sql in Supabase if you haven&apos;t yet.</div>}
      {doc && doc.programs.length === 0 && (
        <div className="err">No program of {doc.department.name} is bound to NBEAC, so there is nothing for an NBEAC SAR to report. Programs are bound to their council under Visit readiness › Programs, councils &amp; standards.</div>
      )}
      {doc && doc.otherCouncil.length > 0 && (
        <p className="small-note" style={{ margin: "8px 0" }}>
          Covers the NBEAC programs only ({doc.programs.join(", ") || "none"}). Left out, as they belong to another council: {doc.otherCouncil.map((o) => `${o.program} (${o.body})`).join(", ")}.
        </p>
      )}
      {doc && (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <b>{all.filled} of {all.total} items filled ({all.total ? Math.round((100 * all.filled) / all.total) : 0}%)</b>
              <span className="small-note">Items marked missing link to where they are kept.</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, marginTop: 10 }}>
              {prog.map((p) => (
                <a key={p.key} href={`#form-${p.key}`} style={{ textDecoration: "none", color: "inherit", fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>{p.title.replace(/^Form \d: /, "")}</span><b>{p.filled}/{p.total}</b></div>
                  <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginTop: 3 }}><div style={{ width: `${p.total ? (100 * p.filled) / p.total : 0}%`, height: "100%", background: "var(--sage)" }} /></div>
                </a>
              ))}
            </div>
          </div>
          {doc.forms.map((f) => (
            <details key={f.key} id={`form-${f.key}`} className="card" open={searchParams.form === f.key}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 15 }}>{f.title} <span className="small-note" style={{ fontWeight: 400 }}>· weight {f.weight} · {prog.find((p) => p.key === f.key)!.filled} of {prog.find((p) => p.key === f.key)!.total} filled</span></summary>
              {f.items.map((it) => <ItemView key={it.code + it.question} it={it} scopeKey={dept!.id} canWrite={canWrite} />)}
            </details>
          ))}
        </>
      )}
    </Shell>
  );
}
