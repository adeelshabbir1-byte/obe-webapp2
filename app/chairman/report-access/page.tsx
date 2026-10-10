import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { ALL_REPORTS } from "../../../lib/reportRegistry";
import Shell from "../../../components/Shell";
import ReportAccessManager from "../../../components/ReportAccessManager";
import { navForRole } from "../../../components/reportNav";

export default async function ReportAccessPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [rules, coordinators] = await Promise.all([
    prisma.reportAccessRule.findMany({ where: { chairmanId: user.id } }),
    prisma.user.findMany({ where: { managedById: user.id, isVisitingPlaceholder: false } }),
  ]);
  const coordinatorIds = coordinators.filter((c) => c.role === "PROGRAM_COORDINATOR").map((c) => c.id);
  const faculty = await prisma.user.findMany({ where: { managedById: { in: coordinatorIds } } });
  const people = [...coordinators, ...faculty].map((p) => ({ id: p.id, name: p.name, role: p.role }));

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Report Access Control</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Control who can view or edit each report — by role, or for one specific person. Anything with no rule
        set stays open to every role normally eligible for it, exactly as before.
      </p>
      <ReportAccessManager reports={ALL_REPORTS} initialRules={rules} people={people} />
    </Shell>
  );
}
