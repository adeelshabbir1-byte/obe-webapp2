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
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Data export</h3>
        <p className="small-note">Download every academic table of your institute (staff, batches, students, courses, PLOs, CLOs, assessments, marks, results) as spreadsheets in one ZIP — your own backup. Passwords are never included.</p>
        <a className="btn btn-sm" href="/api/institute-export">Download institute data</a> <a className="act" href="/security" target="_blank" rel="noopener noreferrer">Security &amp; data protection</a>
      </div>
    </Shell>
  );
}
