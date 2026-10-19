import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { checkCurriculumChanges } from "../../../lib/curriculumWatch";
import { chairmanIdFor } from "../../../lib/reportScope";
import { roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import AdvisorDashboard from "../../../components/AdvisorDashboard";
import { prisma } from "../../../lib/db";

export default async function AdvisorDashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  // Advising is a duty given per batch, not a role: whoever a Program Lead named as a batch's Advisor sees it here,
  // whichever role they are working in right now (Instructor, Subject Expert, Program Lead, Chairman...).
  const advised = await prisma.batch.findMany({ where: { advisorId: user.id }, select: { degreeProgram: true, batchName: true } });
  // Today's curriculum is what degree plans assume for later batches: tell advisors when it changes.
  if (advised.length) await checkCurriculumChanges(await chairmanIdFor(user)).catch(() => []);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Advisor Dashboard</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Students in any batch your Program Coordinator has designated you the Advisor for — their academic
        standing, degree plan, and any registration change waiting on your approval.
      </p>
      {advised.length === 0 ? (
        <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>You are not the Advisor of any batch yet. A Program Lead names a batch&apos;s Advisor on Coordinator → Batches.</p></div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, marginTop: -10, marginBottom: 14 }}>You advise: <b>{advised.map((b) => `${b.degreeProgram} — ${b.batchName}`).join(", ")}</b></p>
          <div className="card" style={{ borderLeft: "4px solid #7A3E9D", fontSize: 13.5 }}>Is an advisee struggling with topics from an earlier course? <a href="/remediation-flags"><b>Flag them for remediation →</b></a> As their advisor your flag comes first; the OMC and Program Lead plan a tutorial or junior-class sitting.</div>
          <AdvisorDashboard />
        </>
      )}
    </Shell>
  );
}
