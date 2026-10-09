import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import HecComparisonReport from "../../../../components/HecComparisonReport";
import { computeHecComparison } from "../../../../lib/hecCompare";
import { OVERVIEW_ROLES, leadsInScope } from "../../../../lib/readinessScope";

export default async function ProgramHecPage({ params, searchParams }: { params: { leadId: string }; searchParams: { batchId?: string; curriculumId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const { leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === params.leadId);
  if (!lead) notFound();
  const data = await computeHecComparison(lead.id, searchParams.batchId || "", searchParams.curriculumId || "");
  return (
    <Shell roleLabel="Accreditation" userName={user.name} navLinks={navForRole(user.role)}>
      <a className="btn" href={`/accreditation-overview/${lead.id}`} style={{ marginBottom: 10, display: "inline-block" }}>← Readiness report</a>
      <h2 style={{ fontSize: 16, margin: "6px 0 2px", color: "var(--slate)" }}>{lead.leadProgram || "Program"} · {lead.department_?.name || ""} · Program Lead: {lead.name}</h2>
      <HecComparisonReport data={data} action={`/accreditation-overview/${lead.id}/hec`} />
    </Shell>
  );
}
