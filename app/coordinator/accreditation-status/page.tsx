import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import ReadinessReport from "../../../components/ReadinessReport";
import { computeReadiness } from "../../../lib/readiness";
import { navForRole } from "../../../components/reportNav";


// ---- How "ready" the program is for accreditation (NCEAC-style outcome-based review) --------------------------------
// Every number here is counted live from the app's own records. A score is the share of things that are done; half-done

export default async function AccreditationStatusPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const data = await computeReadiness(user, searchParams.batchId || "");
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <ReadinessReport data={data} sarHref={`/coordinator/sar?batchId=${data.batchId}`} />
    </Shell>
  );
}
