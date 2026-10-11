import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import RegistrationRulesManager from "../../components/RegistrationRulesManager";

export default async function RegistrationRulesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["OMC", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  return (
    <Shell roleLabel={user.role === "CHAIRMAN" ? "Institute Head" : "OMC Member"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Registration Rules</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        The rules every course registration follows — set by the OMC. The Institute Head can exempt an individual student from a rule.
        They apply to self-registration, advisor approvals, Run Default Enrollment and registration from an advisor-locked degree plan.
      </p>
      <RegistrationRulesManager />
    </Shell>
  );
}
