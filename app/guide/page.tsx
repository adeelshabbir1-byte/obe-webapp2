import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import GuideChecklist from "../../components/GuideChecklist";
import { GUIDES, guideFor } from "../../lib/roleGuides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Getting started" };

export default async function Guide({ searchParams }: { searchParams: { role?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const role = searchParams.role && GUIDES[searchParams.role] ? searchParams.role : user.role;
  const g = guideFor(role);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Getting started — {roleLabel(role)}</h1>
      <p className="small-note">Your first week, step by step. Tick each step when done; the next one shows at the top of every page until you finish. For OBE itself, see <Link href="/learn">Learn OBE</Link>; for who does what, <Link href="/who-does-what">Who Does What</Link>.</p>
      {g ? <div className="card"><p style={{ marginTop: 0 }}>{g.intro}</p><GuideChecklist role={role} steps={g.steps} /></div> : <div className="card small-note">No guide for this role yet — your menu lists your pages.</div>}
      <div className="card small-note">Guides for other roles: {Object.keys(GUIDES).map((r) => <Link key={r} href={`/guide?role=${r}`} style={{ marginRight: 10 }}>{roleLabel(r)}</Link>)}</div>
    </Shell>
  );
}
