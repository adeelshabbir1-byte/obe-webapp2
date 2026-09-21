import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import AiConfigForm from "../../../components/AiConfigForm";

const NAV = [
  { href: "/chairman/coordinators", label: "Program Coordinators" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" },
  { href: "/chairman/assigners", label: "Course Assigners" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" },
  { href: "/chairman/ai-configuration", label: "AI Configuration" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function AiConfigurationPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI Configuration</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Bring your own AI provider and API key for this institution — used for DotAI evidence checking and CQI action drafting.
        If you don't set one up, the platform's own default is used instead where available.
      </p>
      <AiConfigForm />
    </Shell>
  );
}
