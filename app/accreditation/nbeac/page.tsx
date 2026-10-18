import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { sarScope } from "../../../lib/sarAccess";
import { buildNbeacSar } from "../../../lib/nbeacSar";
import { itemKeys, sarItemStatuses } from "../../../lib/sarStatus";
import SarTabs from "../../../components/sar/SarTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "NBEAC SAR" };
const BUILDERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const WRITERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
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
  const keys = doc ? itemKeys(doc) : new Map();
  const statuses = doc ? await sarItemStatuses(scope.chairmanId, dept!.id, doc).catch(() => ({})) : {};
  const canWrite = WRITERS.includes(user.role);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>NBEAC Self-Assessment Report</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            SAR 4.0 for {doc?.school || "the business school"}, filled from the system. Each table is a tab coloured by where it stands — grey not assigned, amber in progress, blue entered, green ready, red changed since approval. Tables update as the data is kept; write the descriptive answers here.
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
        <SarTabs forms={doc.forms.map((f) => ({ key: f.key, title: f.title, weight: f.weight, items: f.items.map((it) => ({ ...it, key: keys.get(it)! })) }))}
          statuses={statuses} scopeKey={dept!.id} userId={user.id} canWrite={canWrite} canApprove={BUILDERS.includes(user.role)} initialForm={searchParams.form} />
      )}
    </Shell>
  );
}
