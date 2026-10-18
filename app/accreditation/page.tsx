import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { AREAS, kindsOf, sectionsOf } from "../../lib/sarRegistry";
import { areasFor, sarScope } from "../../lib/sarAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accreditation data" };

// The accreditation data hub: the parts of the NBEAC SAR that are kept here (everything else comes from the rest of the
// system), how much of each is filled in, and the SAR builder.
export default async function AccreditationHub() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await sarScope(user);
  const areas = areasFor(scope);
  if (!scope.chairmanId || !areas.length) redirect("/dashboard");
  let missing = false;
  const counts = await prisma.accreditationRecord.groupBy({ by: ["kind"], where: { chairmanId: scope.chairmanId, ...(scope.instituteWide ? {} : { OR: [{ departmentId: null }, { departmentId: { in: scope.departments.map((d) => d.id).concat(["none"]) } }] }) }, _count: true }).catch(() => { missing = true; return []; });
  const countOf = (kind: string) => counts.find((c) => c.kind === kind)?._count || 0;
  const canBuild = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"].includes(user.role);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation data</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            The NBEAC Self-Assessment Report (SAR 4.0) asks for some information the rest of the system doesn&apos;t keep — governance, policies, admissions
            figures, counselling, research, linkages, finance details and confidential cases. Keep it here; the SAR builder fills every table from it and from
            the courses, students, faculty, results and facilities already in the system.
          </p>
        </div>
        {canBuild && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Link href="/accreditation/eligibility" className="btn btn-secondary">Council eligibility</Link><Link href="/accreditation/nbeac" className="btn btn-brass">Open the NBEAC SAR</Link></div>}
      </div>
      {missing && <div className="err">The accreditation tables are not in the database yet — run prisma/migration_nbeac_sar.sql in Supabase.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
        {AREAS.filter((a) => areas.includes(a.key)).map((a) => {
          const kinds = kindsOf(a.key).filter((k) => scope.canViewKind(k));
          const withData = kinds.filter((k) => countOf(k.kind) > 0).length;
          const records = kinds.reduce((n, k) => n + countOf(k.kind), 0);
          return (
            <Link key={a.key} href={`/accreditation/${a.key}`} className="card" style={{ textDecoration: "none", color: "inherit", margin: 0, display: "grid", gap: 6, borderLeft: `4px solid ${a.key === "cases" ? "var(--rust)" : "var(--brass)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{a.label}</b><span className="small-note">{a.form}</span></div>
              <span className="small-note">{a.blurb}</span>
              <span style={{ fontSize: 12.5 }}>
                {kinds.length > 0 && <>{withData} of {kinds.length} registers started · {records} record{records === 1 ? "" : "s"}</>}
                {sectionsOf(a.key).length > 0 && <>{kinds.length ? " · " : ""}{sectionsOf(a.key).length} profile section{sectionsOf(a.key).length > 1 ? "s" : ""}</>}
              </span>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
