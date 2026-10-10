import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import InstituteSettingsForm from "../../../components/InstituteSettingsForm";
import RecomputeWeightsButton from "../../../components/RecomputeWeightsButton";
import { navForRole } from "../../../components/reportNav";

export default async function InstituteSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute Settings</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Shown across every page for your institution.</p>
      <InstituteSettingsForm initialName={fullUser?.instituteName || ""} />
      <RecomputeWeightsButton />
    </Shell>
  );
}
