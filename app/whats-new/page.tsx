import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "../../components/Shell";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { entriesFor } from "../../lib/whatsNew";

export const dynamic = "force-dynamic";

// Every "What's new" entry for the person's role(s), newest first.
export default async function WhatsNewPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const list = entriesFor(user.role, ((user as { extraRoles?: string[] }).extraRoles) || []);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>What&apos;s new</h1>
      <p className="small-note">Changes in OBEHUB that matter for your role, newest first.</p>
      <div className="card">
        {list.length === 0 ? <p>Nothing yet.</p> : <ul style={{ paddingLeft: 18 }}>{list.map((e) => <li key={e.id} style={{ marginBottom: 6 }}><span className="small-note">{e.date}</span> — {e.href ? <Link href={e.href}>{e.text}</Link> : e.text}</li>)}</ul>}
      </div>
    </Shell>
  );
}
