import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getSignedInUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { latest } from "../../lib/notifications";
import MarkAllRead from "../../components/MarkAllRead";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const me = await getSignedInUser();
  const items = await latest(me?.id || user.id, 200);
  const unread = items.filter((i) => !i.readAt).length;
  const day = (d: Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Notifications</h1>
        <span style={{ fontSize: 13, color: "var(--slate)" }}>{unread} unread</span>
        {unread > 0 && <span style={{ marginLeft: "auto" }}><MarkAllRead /></span>}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {items.length === 0 && <p style={{ padding: 16, color: "var(--slate)", margin: 0 }}>Nothing yet. Approvals, assignments, returned work and deadlines will show here.</p>}
        {items.map((n) => (
          <div key={n.id} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: n.readAt ? undefined : "#FDF8F8" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 7, flex: "none", background: n.readAt ? "transparent" : "var(--brass)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5 }}><b>{n.title}</b></div>
              {n.body && <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 2 }}>{n.body}</div>}
              <div style={{ fontSize: 11.5, color: "var(--slate-mute)", marginTop: 4 }}>{day(n.createdAt)}{n.href ? <> · <Link href={n.href}>Open</Link></> : null}</div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
