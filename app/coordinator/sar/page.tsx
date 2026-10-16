import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeReadiness } from "../../../lib/readiness";
import { computeHecComparison } from "../../../lib/hecCompare";
import { sarExtras } from "../../../lib/evidenceFiles";
import SarDocument from "../../../components/SarDocument";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import CouncilNotice from "../../../components/accreditation/CouncilNotice";
import { leadCouncil, standardsFor } from "../../../lib/accreditation/bodies";

export default async function SarPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const council = await leadCouncil(user.managedById, user.leadProgram);
  if (council.body !== "NCEAC") return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <CouncilNotice program={user.leadProgram || user.name} body={council.body} explicit={council.explicit} departmentId={user.departmentId || null} form="NCEAC Self-Assessment Report" />
    </Shell>
  );
  const data = await computeReadiness(user, searchParams.batchId || "", await standardsFor(user.managedById, "NCEAC"));
  const hec = await computeHecComparison(user.id, searchParams.batchId || "", "");
  const evidence = await prisma.programEvidence.findMany({ where: { coordinatorId: user.id }, orderBy: [{ date: "asc" }] });
  const extras = await sarExtras(user.managedById || "none", user.id);
  const [dept, head] = await Promise.all([
    user.departmentId ? prisma.department.findUnique({ where: { id: user.departmentId }, select: { name: true } }) : null,
    user.managedById ? prisma.user.findUnique({ where: { id: user.managedById }, select: { name: true } }) : null,
  ]);
  return <SarDocument data={data} hec={hec} evidence={evidence} program={user.leadProgram || "Degree program"} department={dept?.name || "—"} lead={user.name} instituteHead={head?.name || "—"} back="/coordinator/accreditation-status" files={extras.files} meetings={extras.meetings} />;
}
