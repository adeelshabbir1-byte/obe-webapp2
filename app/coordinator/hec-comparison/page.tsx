import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import HecComparisonReport from "../../../components/HecComparisonReport";
import { computeHecComparison } from "../../../lib/hecCompare";
import { navForRole } from "../../../components/reportNav";


export default async function HecComparisonPage({ searchParams }: { searchParams: { batchId?: string; curriculumId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const data = await computeHecComparison(user.id, searchParams.batchId || "", searchParams.curriculumId || "");
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <HecComparisonReport data={data} action="/coordinator/hec-comparison" />
    </Shell>
  );
}
