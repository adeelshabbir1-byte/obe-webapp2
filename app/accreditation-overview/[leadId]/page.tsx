import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import ReadinessReport from "../../../components/ReadinessReport";
import { computeReadiness } from "../../../lib/readiness";
import { OVERVIEW_ROLES, leadsInScope } from "../../../lib/readinessScope";

export default async function ProgramReadinessPage({ params, searchParams }: { params: { leadId: string }; searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const { chairmanId, leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === params.leadId);
  if (!lead) notFound();
  const data = await computeReadiness({ id: lead.id, managedById: chairmanId, departmentId: lead.departmentId }, searchParams.batchId || "");
  return (
    <Shell roleLabel="Accreditation" userName={user.name} navLinks={navForRole(user.role)}>
      <a className="btn" href="/accreditation-overview" style={{ marginBottom: 10, display: "inline-block" }}>← All programs</a>
      <a className="btn" href={`/accreditation-overview/${lead.id}/hec`} style={{ marginLeft: 8, marginBottom: 10, display: "inline-block" }}>Curriculum vs HEC</a>
      <h2 style={{ fontSize: 16, margin: "6px 0 2px", color: "var(--slate)" }}>{lead.leadProgram || "Program"} · {lead.department_?.name || ""} · Program Lead: {lead.name}</h2>
      <ReadinessReport data={data} />
    </Shell>
  );
}
