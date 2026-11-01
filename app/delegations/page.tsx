import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { ROLE_LABEL } from "../../lib/delegation";
import DelegationsClient from "./DelegationsClient";

export const dynamic = "force-dynamic";

// My delegations, given and received (Adeel prompt §13). Approvals-inbox handovers stay on My Approvals; acting on the org chart.
export default async function DelegationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>My delegations</h1>
      <p className="small-note">Hand chosen tasks to a colleague for a period (e.g. an HOD Delegate who names Subject Experts for the Programming chain), or let someone act in your position while you are on leave. Handing over only your approvals inbox is on <a href="/approvals">My Approvals</a>.</p>
      <DelegationsClient roleLabel={ROLE_LABEL[user.role] || roleLabel(user.role)} />
    </Shell>
  );
}
