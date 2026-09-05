import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ALL_REPORTS } from "../../../../lib/reportRegistry";
import { canViewReport } from "../../../../lib/reportAcl";
import PrintBundleClient from "../../../../components/PrintBundleClient";

export default async function PrintBundlePage({ params }: { params: { bundleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  const bundle = await prisma.reportBundle.findUnique({ where: { id: params.bundleId } });
  if (!bundle) notFound();
  if (bundle.scope === "COORDINATOR" && bundle.ownerId !== user.id) notFound();

  const reportIds: string[] = JSON.parse(bundle.reportIds);
  const allowed: typeof ALL_REPORTS = [];
  for (const id of reportIds) {
    const def = ALL_REPORTS.find((r) => r.id === id);
    if (def && (await canViewReport(user, id))) allowed.push(def);
  }

  return <PrintBundleClient bundleName={bundle.name} reports={allowed} />;
}
