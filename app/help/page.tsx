import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import HelpCenter from "../../components/help/HelpCenter";
import { articlesFor, canEditArticles, helpViewer } from "../../lib/help/access";
import { visibleCards } from "../../lib/help/cards";
import { CATEGORIES } from "../../lib/help/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help" };

// The manual and FAQ for the signed-in person's role, plus their institute's own articles.
export default async function HelpPage({ searchParams }: { searchParams: { a?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const viewer = await helpViewer("staff");
  const articles = visibleCards(await articlesFor(viewer?.chairmanId || null), user.role);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Help center</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 820 }}>
            Guides and answers for your role as {roleLabel(user.role)} — who can do what, how to do it and what it changes. Press <b>?</b> on any page for the help that fits that page.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/help/permissions" className="btn btn-secondary btn-sm">Who can do what</Link> <Link href="/help/glossary" className="btn btn-secondary btn-sm">Glossary</Link>
          <Link href="/help/requests" className="btn btn-secondary btn-sm">My help requests</Link>
          {canEditArticles(viewer) && <Link href="/help/manage" className="btn btn-brass btn-sm">Manage help</Link>}
        </div>
      </div>
      <HelpCenter audience="staff" articles={articles} categories={CATEGORIES} initialKey={searchParams.a} />
    </Shell>
  );
}
