import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import FeedbackForm from "../../components/FeedbackForm";
import { CATEGORIES, STATUSES, contributors, type FeedbackRow } from "../../lib/feedback";

export const dynamic = "force-dynamic";

// Every user can tell the platform owner what would make the system better. Useful feedback is recognised.
export default async function FeedbackPage({ searchParams }: { searchParams: { page?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  let mine: FeedbackRow[] = [], missing = false;
  try { mine = (await prisma.systemFeedback.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 })) as FeedbackRow[]; } catch { missing = true; }
  const thanks = await contributors();
  const recognised = mine.filter((f) => f.recognized).length;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feedback to improve the system</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 860 }}>
        Tell the people who build this system what would make your work easier, or what is wrong. Every message is read and answered. Feedback that leads to an
        improvement earns its sender the <b>System Improver</b> badge on their recognition record, and their name on the contributors list below.
      </p>
      {missing && <div className="err">Feedback can&apos;t be saved yet — the feedback table is not in the database (run prisma/migration_oct2026_features.sql).</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)", gap: 14, alignItems: "start" }} className="dash-grid">
        <div className="card"><FeedbackForm defaultPage={searchParams.page} /></div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Thank you, contributors</h3>
          {thanks.length === 0 ? <p className="small-note">No feedback has been recognised yet — yours could be the first.</p> : (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>{thanks.map((c, i) => <li key={i}>🌟 {c.name} <span className="small-note">({c.count} improvement{c.count === 1 ? "" : "s"})</span></li>)}</ol>
          )}
          {recognised > 0 && <p style={{ fontSize: 13, marginBottom: 0 }}>You have <b>{recognised}</b> recognised feedback item{recognised === 1 ? "" : "s"}.</p>}
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your feedback</h3>
        {mine.length === 0 ? <p className="small-note">You haven&apos;t sent any feedback yet.</p> : (
          <table>
            <thead><tr><th>Sent</th><th>Feedback</th><th>Status</th><th>Answer</th></tr></thead>
            <tbody>
              {mine.map((f) => (
                <tr key={f.id}>
                  <td className="small-note" style={{ whiteSpace: "nowrap" }}>{f.createdAt.toISOString().slice(0, 10)}</td>
                  <td><b>{f.title}</b>{f.recognized && <span className="badge badge-ok" style={{ marginLeft: 6 }}>🌟 Recognised</span>}<div className="small-note">{CATEGORIES[f.category] || f.category}{f.pageUrl ? ` · ${f.pageUrl}` : ""}</div></td>
                  <td><span className={`badge ${STATUSES[f.status]?.[1] || "badge-neutral"}`}>{STATUSES[f.status]?.[0] || f.status}</span></td>
                  <td style={{ fontSize: 12.5, maxWidth: 380 }}>{f.adminReply || <span className="small-note">Not answered yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
