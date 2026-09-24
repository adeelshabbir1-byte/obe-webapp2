import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import AdvisorDashboard from "../../../components/AdvisorDashboard";

export default async function AdvisorDashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) redirect("/dashboard");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Advisor Dashboard</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Students in any batch your Program Coordinator has designated you the Advisor for — their academic
        standing, degree plan, and any registration change waiting on your approval.
      </p>
      <AdvisorDashboard />
    </Shell>
  );
}
