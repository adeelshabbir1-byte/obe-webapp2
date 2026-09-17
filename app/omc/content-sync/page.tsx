import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import ContentSyncManager from "../../../components/ContentSyncManager";

export default async function ContentSyncPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Content Sync</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Link courses so a Subject Expert's saved changes propagate automatically, going forward — separate from
        Course Equivalence (combined teaching), though linked courses offered in the same term are combined
        automatically too.
      </p>
      <ContentSyncManager />
    </Shell>
  );
}
