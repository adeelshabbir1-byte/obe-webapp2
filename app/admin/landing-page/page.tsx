import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import LandingPageEditor from "../../../components/LandingPageEditor";
import { navForRole } from "../../../components/reportNav";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";


export default async function LandingPageAdminPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!(await adminCan(user, "ONBOARDING"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);

  let content = await prisma.landingPageContent.findFirst();
  if (!content) content = await prisma.landingPageContent.create({ data: {} });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Landing Page</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Edit the public marketing page shown at your platform's root URL, before anyone logs in.
      </p>
      <LandingPageEditor initial={content} />
    </Shell>
  );
}
