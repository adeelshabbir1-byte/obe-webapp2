import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import ReadinessReport from "../../../components/ReadinessReport";
import { computeReadiness } from "../../../lib/readiness";
import { navForRole } from "../../../components/reportNav";
import CouncilNotice from "../../../components/accreditation/CouncilNotice";
import { leadCouncil, standardsFor } from "../../../lib/accreditation/bodies";


// ---- How "ready" the program is for accreditation (NCEAC-style outcome-based review) --------------------------------
// Every number here is counted live from the app's own records. A score is the share of things that are done; half-done

export default async function AccreditationStatusPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const council = await leadCouncil(user.managedById, user.leadProgram);
  if (council.body !== "NCEAC") return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <CouncilNotice program={user.leadProgram || user.name} body={council.body} explicit={council.explicit} departmentId={user.departmentId || null} form="NCEAC accreditation status" />
    </Shell>
  );
  const data = await computeReadiness(user, searchParams.batchId || "", await standardsFor(user.managedById, "NCEAC"));
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <ReadinessReport data={data} sarHref={`/coordinator/sar?batchId=${data.batchId}`} />
    </Shell>
  );
}
