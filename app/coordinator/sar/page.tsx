import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeReadiness } from "../../../lib/readiness";
import { computeHecComparison } from "../../../lib/hecCompare";
import SarDocument from "../../../components/SarDocument";

export default async function SarPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const data = await computeReadiness(user, searchParams.batchId || "");
  const hec = await computeHecComparison(user.id, searchParams.batchId || "", "");
  const evidence = await prisma.programEvidence.findMany({ where: { coordinatorId: user.id }, orderBy: [{ date: "asc" }] });
  const [dept, head] = await Promise.all([
    user.departmentId ? prisma.department.findUnique({ where: { id: user.departmentId }, select: { name: true } }) : null,
    user.managedById ? prisma.user.findUnique({ where: { id: user.managedById }, select: { name: true } }) : null,
  ]);
  return <SarDocument data={data} hec={hec} evidence={evidence} program={user.leadProgram || "Degree program"} department={dept?.name || "—"} lead={user.name} instituteHead={head?.name || "—"} back="/coordinator/accreditation-status" />;
}
