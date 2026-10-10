import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import EvidenceManager from "../../../components/EvidenceManager";
import { navForRole } from "../../../components/reportNav";


export default async function EvidencePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const rows = await prisma.programEvidence.findMany({ where: { coordinatorId: user.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Evidence</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>Records the visiting team will ask for. Each one counts towards the matching criterion in your Accreditation Status.</p>
      <EvidenceManager rows={rows.map((r) => ({ id: r.id, area: r.area, kind: r.kind, title: r.title, organization: r.organization, date: r.date?.toISOString() || null, count: r.count, target: r.target, actual: r.actual }))} />
    </Shell>
  );
}
