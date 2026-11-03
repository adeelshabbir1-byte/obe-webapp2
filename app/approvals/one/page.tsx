import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { inboxFor } from "../../../lib/approvals/inbox";
import OneApproval from "../../../components/OneApproval";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Approve" };

// One approval on its own, big buttons, for the link in a message or a phone: approve, or return with a reason.
export default async function OneApprovalPage({ searchParams }: { searchParams: { k?: string; i?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/approvals/one?k=${searchParams.k || ""}&i=${searchParams.i || ""}`)}`);
  if (!user.mfaVerified) redirect("/mfa-verify");
  const box = await inboxFor(user as never);
  const it = box.items.find((x) => x.kind === searchParams.k && x.id === searchParams.i);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note"><Link href="/approvals">← All my approvals ({box.items.length})</Link></p>
      {!it ? <div className="card"><p>This item is no longer waiting for you — it was decided already, or it is with someone else.</p></div> : (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="small-note" style={{ textTransform: "uppercase", fontWeight: 700 }}>{it.label}</div>
          <h1 style={{ fontSize: 20, margin: "4px 0" }}>{it.title}</h1>
          <p style={{ fontSize: 14 }}>{it.from ? <>From <b>{it.from}</b>. </> : null}{it.area}{it.due ? ` · due ${new Date(it.due).toLocaleDateString("en-GB")}` : ""}</p>
          {it.note && <p className="small-note">{it.note}</p>}
          {(it.checks || []).length > 0 && <p style={{ fontSize: 13, color: "#8a5a00" }}>⚠ {(it.checks || []).join(" · ")}</p>}
          <p><a href={it.href}>See the details</a></p>
          <OneApproval kind={it.kind} id={it.id} actions={it.actions} />
        </div>
      )}
    </Shell>
  );
}
