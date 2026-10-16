import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import HelpRequests from "../../../components/help/HelpRequests";
import { KB_EDITORS } from "../../../lib/help/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help requests" };

export default async function HelpRequestsPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Help requests</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 820 }}>
            Questions the help center didn&apos;t answer go straight to the people who can act on them. What you asked is on the left; requests routed to you to answer are under “For me to answer”.
            {user.role === "CHAIRMAN" ? " As Institute Head you see every request of the institute." : ""}
          </p>
        </div>
        <Link href="/help" className="btn btn-secondary btn-sm">Help center</Link>
      </div>
      <HelpRequests audience="staff" canPublish={KB_EDITORS.includes(user.role)} initialId={searchParams.id} />
    </Shell>
  );
}
