import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import HelpManager, { type OwnArticle } from "../../../components/help/HelpManager";
import { KB_EDITORS, articlesFor, rowToArticle } from "../../../lib/help/access";
import { CATEGORIES, EVERYONE, STUDENT } from "../../../lib/help/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage help" };

const AUDIENCES = [EVERYONE, STUDENT, "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC", "SUBJECT_EXPERT", "INSTRUCTOR", "COURSE_ASSIGNER", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER"];
const audienceLabel = (r: string) => (r === EVERYONE ? "Everyone incl. students" : r === STUDENT ? "Students" : roleLabel(r));

// The Institute Head's own help articles (the Super User's are for every institute), and what to write next.
export default async function ManageHelpPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!KB_EDITORS.includes(user.role)) redirect("/help");
  const scope = user.role === "SUPER_USER" ? null : user.id;
  const since = new Date(Date.now() - 90 * 86400_000);

  let missing = false;
  const [rows, logs, votes] = await Promise.all([
    prisma.helpArticle.findMany({ where: { chairmanId: scope }, orderBy: { updatedAt: "desc" } }).catch(() => { missing = true; return []; }),
    prisma.helpSearchLog.findMany({ where: { ...(scope ? { chairmanId: scope } : {}), createdAt: { gte: since } }, select: { query: true, createdAt: true }, take: 5000, orderBy: { createdAt: "desc" } }).catch(() => []),
    prisma.helpFeedback.findMany({ where: scope ? { chairmanId: scope } : {}, select: { articleKey: true, helpful: true }, take: 20000 }).catch(() => []),
  ]);
  const own: OwnArticle[] = rows.map((r) => {
    const a = rowToArticle(r);
    return { id: r.id, kind: r.kind, category: r.category, title: r.title, summary: r.summary, steps: a.steps || [], whoCan: r.whoCan || "", affects: r.affects || "", roles: a.roles, pages: a.pages || [], keywords: a.keywords || [], href: r.href || "", published: r.published, updatedAt: r.updatedAt.toISOString() };
  });
  const byQuery = new Map<string, { count: number; last: Date }>();
  for (const l of logs) { const e = byQuery.get(l.query); if (e) e.count++; else byQuery.set(l.query, { count: 1, last: l.createdAt }); }
  const unanswered = Array.from(byQuery, ([query, v]) => ({ query, count: v.count, last: v.last.toISOString() })).sort((a, b) => b.count - a.count).slice(0, 40);
  const titles = new Map((await articlesFor(scope, { includeDrafts: true })).map((a) => [a.key, a.title]));
  const tally = new Map<string, { yes: number; no: number }>();
  for (const v of votes) { const t = tally.get(v.articleKey) || { yes: 0, no: 0 }; if (v.helpful) t.yes++; else t.no++; tally.set(v.articleKey, t); }
  const feedback = Array.from(tally, ([key, t]) => ({ key, title: titles.get(key) || key, ...t })).sort((a, b) => b.no - b.yes - (a.no - a.yes) || b.no - a.no).slice(0, 40);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Manage help</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 860 }}>
            {scope ? "Add your institute's own answers — local rules, offices, deadlines — beside the built-in manual. Only your institute sees them." : "Articles written here appear in the help center of every institute."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/help" className="btn btn-secondary btn-sm">Help center</Link>
          <Link href="/help/requests" className="btn btn-secondary btn-sm">Help requests</Link>
        </div>
      </div>
      {missing && <div className="err">Run prisma/migration_help_center.sql in Supabase to add your own articles. The built-in manual works without it.</div>}
      <HelpManager own={own} categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))} roles={AUDIENCES.map((r) => ({ key: r, label: audienceLabel(r) }))}
        unanswered={unanswered} feedback={feedback} scopeLabel={scope ? "Your institute's articles" : "Articles for every institute"} />
    </Shell>
  );
}
