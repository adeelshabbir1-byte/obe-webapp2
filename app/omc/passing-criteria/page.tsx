import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import PassingCriteriaForm from "../../../components/PassingCriteriaForm";

export default async function PassingCriteriaPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const criteria = user.managedById ? await prisma.passingCriteria.findUnique({ where: { chairmanId: user.managedById } }) : null;

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Passing Criteria</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set the institution-wide CLO/PLO attainment threshold.
      </p>
      <PassingCriteriaForm initial={{ cloPassingPct: criteria?.cloPassingPct ?? 50, ploPassingPct: criteria?.ploPassingPct ?? 50 }} />
    </Shell>
  );
}
