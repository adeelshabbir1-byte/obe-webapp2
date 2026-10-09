import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import AdmissionCriteriaManager from "../../components/AdmissionCriteriaManager";
import { INSTITUTE_KEY, VIEWER_ROLES, academicScope, programsOf } from "../../lib/academic";

const LABEL: Record<string, string> = { CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead" };

export default async function AdmissionCriteriaPage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!VIEWER_ROLES.includes(user.role)) redirect("/dashboard");

  const { chairmanId, facultyId, isChairman, isDean } = await academicScope(user);
  const faculties = await prisma.faculty.findMany({ where: { chairmanId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  // Institute Head picks a faculty; everyone else sees their own faculty (or the institute when there are no faculties).
  const options = [...faculties.map((f) => ({ key: f.id, name: f.name })), { key: INSTITUTE_KEY, name: "Departments without a faculty" }];
  const scopeKey = isChairman ? (options.some((o) => o.key === searchParams.scope) ? (searchParams.scope as string) : options[0].key) : facultyId || INSTITUTE_KEY;
  const programs = await programsOf(chairmanId, scopeKey === INSTITUTE_KEY ? null : scopeKey);
  const saved = await prisma.admissionCriteria.findMany({ where: { chairmanId, scopeKey } });
  const rows = programs.map((p) => {
    const s = saved.find((x) => x.degreeProgram === p);
    return { degreeProgram: p, academicYear: s?.academicYear || "", minPercentage: s?.minPercentage?.toString() ?? "", requiredSubjects: s?.requiredSubjects || "", entryTest: s?.entryTest || "", minTestScore: s?.minTestScore?.toString() ?? "", seats: s?.seats?.toString() ?? "", transferPolicy: s?.transferPolicy || "", otherConditions: s?.otherConditions || "" };
  });
  const title = isChairman ? options.find((o) => o.key === scopeKey)?.name : faculties.find((f) => f.id === facultyId)?.name || "";
  return (
    <Shell roleLabel={LABEL[user.role] || "Admissions"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Admission Criteria</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Who may be admitted to each degree program{title ? ` of ${title}` : ""}. Each Dean sets these for the programs of their own faculty. NCEAC&apos;s rules: at least 50% in Intermediate or DAE with Mathematics (pre-medical candidates are eligible at 50% if they study two extra Mathematics courses of 6 credit hours in the first year); at least 60% for computing engineering; no more than 50% of the degree&apos;s credit hours may be transferred in. These feed Criterion 4 of the accreditation report.
      </p>
      {isChairman && options.length > 1 && (
        <form method="GET" className="card" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "end" }}>
          <label style={{ fontSize: 12 }}>Faculty<br /><select name="scope" defaultValue={scopeKey} style={{ padding: "6px 8px" }}>{options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select></label>
          <button className="btn" type="submit">Show</button>
        </form>
      )}
      {rows.length === 0 ? <div className="card" style={{ color: "var(--slate)" }}>No degree programs are linked to {isDean ? "your faculty" : "this faculty"} yet. Add programs to its departments first.</div>
        : <AdmissionCriteriaManager scopeKey={scopeKey} rows={rows} canEdit={isChairman || isDean} />}
    </Shell>
  );
}
