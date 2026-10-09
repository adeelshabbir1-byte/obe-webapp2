import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { computeReadiness } from "../../../../lib/readiness";
import { computeHecComparison } from "../../../../lib/hecCompare";
import { OVERVIEW_ROLES, leadsInScope } from "../../../../lib/readinessScope";
import { sarExtras } from "../../../../lib/evidenceFiles";
import SarDocument from "../../../../components/SarDocument";

export default async function ProgramSarPage({ params }: { params: { leadId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const { chairmanId, leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === params.leadId);
  if (!lead) notFound();
  const data = await computeReadiness({ id: lead.id, managedById: chairmanId, departmentId: lead.departmentId }, "");
  const hec = await computeHecComparison(lead.id, "", "");
  const evidence = await prisma.programEvidence.findMany({ where: { coordinatorId: lead.id }, orderBy: [{ date: "asc" }] });
  const extras = await sarExtras(chairmanId, lead.id);
  const head = await prisma.user.findUnique({ where: { id: chairmanId }, select: { name: true } });
  return <SarDocument data={data} hec={hec} evidence={evidence} program={lead.leadProgram || "Degree program"} department={lead.department_?.name || "—"} lead={lead.name} instituteHead={head?.name || "—"} back={`/accreditation-overview/${lead.id}`} files={extras.files} meetings={extras.meetings} />;
}
