import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { SarRegister, SarSectionForm } from "../../../components/sar/SarForms";
import { AREAS, kindsOf, sectionsOf, type AreaKey } from "../../../lib/sarRegistry";
import { areasFor, loadProfile, loadRecords, sarScope } from "../../../lib/sarAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accreditation data" };

// Where the rest of each area's SAR data is kept in the system.
const ELSEWHERE: Partial<Record<AreaKey, [string, string][]>> = {
  governance: [["/meetings", "Meetings & Minutes (statutory body meetings)"], ["/hod/department", "Department (Dean and Chairman details)"]],
  curriculum: [["/coordinator/program-profile", "Program Profile (PEOs, program level and approvals, PEO-PLO map)"], ["/coordinator/courses", "Courses and course outlines"], ["/coordinator/course-folders", "Course folders"]],
  students: [["/admission-criteria", "Admission criteria"], ["/coordinator/students", "Students (status: graduated, left, dropped)"], ["/student-activities", "Student societies and events"], ["/chairman/finance", "Scholarships"]],
  faculty: [["/faculty-report", "Faculty details report"], ["/appraisals", "Faculty appraisals"], ["/coordinator/surveys", "Student feedback surveys"], ["/coordinator/load-report", "Teacher load report"]],
  research: [["/faculty/profile", "Faculty profiles (publications, grants)"], ["/fyp", "Final Year Projects"]],
  outreach: [["/coordinator/stakeholders", "Alumni & employers"], ["/meetings", "Industrial advisory board meetings"]],
  resources: [["/chairman/finance", "Finance"], ["/facilities", "Facilities"], ["/library-inventory", "Library"], ["/lab-inventory", "Labs"]],
};

export default async function AccreditationAreaPage({ params, searchParams }: { params: { area: string }; searchParams: { dept?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const area = AREAS.find((a) => a.key === params.area);
  if (!area) notFound();
  const scope = await sarScope(user);
  if (!scope.chairmanId || !areasFor(scope).includes(area.key)) redirect("/accreditation");
  const dept = scope.departments.find((d) => d.id === searchParams.dept) || (scope.instituteWide && !searchParams.dept ? null : scope.departments[0] || null);
  let missing = false;
  const sections = sectionsOf(area.key).filter((s) => scope.canViewSection(s, s.scope === "HEI" ? "HEI" : dept?.id || "none") && (s.scope === "HEI" || dept));
  const [hei, school] = await Promise.all([
    sections.some((s) => s.scope === "HEI") ? loadProfile(scope.chairmanId, "HEI").catch(() => { missing = true; return {}; }) : {},
    dept && sections.some((s) => s.scope === "SCHOOL") ? loadProfile(scope.chairmanId, dept.id).catch(() => { missing = true; return {}; }) : {},
  ]);
  const kinds = kindsOf(area.key).filter((k) => scope.canViewKind(k));
  const records = await loadRecords(user, scope, kinds.map((k) => k.kind), dept ? dept.id : "ALL").catch(() => { missing = true; return []; });
  const q = (deptId: string | null) => `/accreditation/${area.key}${deptId ? `?dept=${deptId}` : ""}`;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>{area.label}</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}><b>NBEAC SAR {area.form}.</b> {area.blurb}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/accreditation" className="btn btn-secondary btn-sm">All areas</Link>
          <Link href={`/accreditation/nbeac${dept ? `?dept=${dept.id}` : ""}`} className="btn btn-brass btn-sm">NBEAC SAR</Link>
        </div>
      </div>
      {missing && <div className="err">The accreditation tables are not in the database yet — run prisma/migration_nbeac_sar.sql in Supabase.</div>}
      {(scope.departments.length > 1 || scope.instituteWide) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
          <span className="small-note">Business school / department:</span>
          {scope.instituteWide && <Link href={q(null)} className={`btn btn-sm ${!dept ? "btn-brass" : "btn-secondary"}`}>Whole institute</Link>}
          {scope.departments.map((d) => <Link key={d.id} href={q(d.id)} className={`btn btn-sm ${dept?.id === d.id ? "btn-brass" : "btn-secondary"}`}>{d.name}</Link>)}
        </div>
      )}
      {ELSEWHERE[area.key] && (
        <p className="small-note">Also used for this part of the SAR: {ELSEWHERE[area.key]!.map(([href, label], i) => <span key={href}>{i ? " · " : ""}<Link href={href}>{label}</Link></span>)}</p>
      )}

      {sections.map((s) => {
        const scopeKey = s.scope === "HEI" ? "HEI" : dept!.id;
        const data = ((s.scope === "HEI" ? hei : school) as Record<string, Record<string, string | number | boolean | null>>)[s.key] || {};
        return (
          <details key={s.key} className="card" open={Object.keys(data).length === 0}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>{s.label} <span className="small-note" style={{ fontWeight: 400 }}>· {s.sar}{s.scope === "SCHOOL" ? ` · ${dept!.name}` : " · institute"}</span></summary>
            <div style={{ marginTop: 10 }}>
              <SarSectionForm key={`${s.key}-${scopeKey}`} scopeKey={scopeKey} section={s.key} fields={s.fields} initial={data} canEdit={scope.canEditSection(s, scopeKey)} />
            </div>
          </details>
        );
      })}

      {!dept && sectionsOf(area.key).some((s) => s.scope === "SCHOOL") && <p className="small-note">Choose a department above to fill in its business-school sections.</p>}

      {kinds.map((k) => {
        const rows = records.filter((r) => r.kind === k.kind);
        return (
          <div key={k.kind} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>{k.label} {k.confidential && <span className="badge badge-no" style={{ marginLeft: 6 }}>confidential</span>}</h3>
              <span className="small-note">{k.sar} · {rows.length} record{rows.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <SarRegister
                def={{ kind: k.kind, label: k.label, sar: k.sar, titleLabel: k.titleLabel, titleOptions: k.titleOptions, dateLabel: k.dateLabel, yearLabel: k.yearLabel, fields: k.fields, file: k.file, hint: k.hint, confidential: k.confidential }}
                rows={rows.map((r) => ({ id: r.id, departmentId: r.departmentId, title: r.title, recordDate: r.recordDate ? r.recordDate.toISOString().slice(0, 10) : null, year: r.year, data: r.data as Record<string, string | number | boolean | null>, fileName: r.fileName, mine: r.createdById === user.id }))}
                departments={scope.departments} defaultDepartment={dept?.id || null}
                canEdit={scope.canEditKind(k) || (!!dept && scope.grantedKindDepts(k).includes(dept.id))} canAddOwn={scope.canSelfServe(k)} canPickInstitute={scope.instituteWide}
              />
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
