import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import FeedbackAdminRow from "../../../components/FeedbackAdminRow";
import { CATEGORIES, STATUSES, type FeedbackRow } from "../../../lib/feedback";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";

export const dynamic = "force-dynamic";

// The platform owner's inbox of feedback from every institute: answer it, track it, and recognise what improved the system.
export default async function AdminFeedbackPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "SUPPORT"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);
  const filter = searchParams.status && STATUSES[searchParams.status] ? searchParams.status : "";
  let rows: FeedbackRow[] = [], counts: { status: string; _count: { _all: number } }[] = [], missing = false;
  try {
    [rows, counts] = await Promise.all([
      prisma.systemFeedback.findMany({ where: filter ? { status: filter } : {}, orderBy: { createdAt: "desc" }, take: 300 }) as Promise<FeedbackRow[]>,
      prisma.systemFeedback.groupBy({ by: ["status"], _count: { _all: true } }) as unknown as Promise<{ status: string; _count: { _all: number } }[]>,
    ]);
  } catch { missing = true; }
  const ids = Array.from(new Set(rows.flatMap((r) => [r.userId, r.chairmanId]).filter((x): x is string => !!x)));
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids.length ? ids : ["none"] } }, select: { id: true, name: true, email: true, instituteName: true } })).map((u) => [u.id, u]));
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all || 0;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>System Feedback</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>Ideas and problems sent by users of every institute. Answer each one; recognise the ones that improved the system — the sender gets the System Improver badge.</p>
      {missing && <div className="err">The feedback table is not in the database yet — run prisma/migration_oct2026_features.sql.</div>}
      <nav className="tabs no-print" aria-label="Status" style={{ marginBottom: 12 }}>
        <Link href="/admin/feedback" className="tab" aria-current={!filter ? "page" : undefined}>All</Link>
        {Object.entries(STATUSES).map(([k, [t]]) => <Link key={k} href={`/admin/feedback?status=${k}`} className="tab" aria-current={filter === k ? "page" : undefined}>{t} ({countOf(k)})</Link>)}
      </nav>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Feedback</th><th>From</th><th>Status</th><th>Answer</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="small-note">No feedback here.</td></tr>}
            {rows.map((f) => {
              const u = users.get(f.userId), inst = f.chairmanId ? users.get(f.chairmanId) : null;
              return (
                <tr key={f.id}>
                  <td style={{ maxWidth: 420 }}>
                    <b>{f.title}</b>{f.recognized && <span className="badge badge-ok" style={{ marginLeft: 6 }}>🌟 Recognised</span>}
                    <div className="small-note">{CATEGORIES[f.category] || f.category} · {f.createdAt.toISOString().slice(0, 10)}{f.pageUrl ? ` · ${f.pageUrl}` : ""}</div>
                    <div style={{ fontSize: 12.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{f.body}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{u?.name || "—"}<div className="small-note">{roleLabel(f.role)}{inst ? ` · ${inst.instituteName || inst.name}` : ""}</div><div className="small-note">{u?.email}</div></td>
                  <td><span className={`badge ${STATUSES[f.status]?.[1] || "badge-neutral"}`}>{STATUSES[f.status]?.[0] || f.status}</span></td>
                  <td><FeedbackAdminRow id={f.id} status={f.status} adminReply={f.adminReply} recognized={f.recognized} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
