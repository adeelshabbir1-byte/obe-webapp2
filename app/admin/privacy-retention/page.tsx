import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import RetentionManager from "../../../components/RetentionManager";

export const dynamic = "force-dynamic";

// Data retention: the Institute Head sets how long inactive accounts and graduated students' detailed records are
// kept (default: keep). The Super Admin sees what would be removed and confirms it — nothing is removed automatically.
export default async function PrivacyRetentionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["SUPER_USER", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const institutes = user.role === "SUPER_USER" ? await prisma.user.findMany({ where: { role: "CHAIRMAN" }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } }) : [{ id: user.id, name: user.name, instituteName: null }];
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : "Institute Head"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Data retention</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, maxWidth: 900 }}>
        How long to keep inactive staff accounts and graduated students&apos; detailed records (marks and attendance). Transcripts and results are always
        kept. The default is to keep everything. Nothing is removed automatically: the Super Admin sees exactly what would go and confirms it.
        See the <a href="/privacy">privacy page</a>.
      </p>
      <RetentionManager superAdmin={user.role === "SUPER_USER"} institutes={institutes.map((i) => ({ id: i.id, name: i.instituteName || i.name }))} />
    </Shell>
  );
}
