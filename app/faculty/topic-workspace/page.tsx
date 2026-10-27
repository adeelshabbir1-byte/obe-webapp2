import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FacultyTopicWorkspace from "../../../components/FacultyTopicWorkspace";
import TopicOverlapGraph from "../../../components/TopicOverlapGraph";
import TopicSuggestionsPanel from "../../../components/TopicSuggestionsPanel";
import TopicProposalsPanel from "../../../components/TopicProposalsPanel";
import TopicChecksPanel from "../../../components/TopicChecksPanel";
import { proposalsFor } from "../../../lib/topicPlan";
import { workspaceCourses, WORKSPACE_ROLES } from "../../../lib/facultyTopicWorkspace";
import { suggestionsFor, type SuggestionRow } from "../../../lib/topicSuggestions";

export const dynamic = "force-dynamic";

export default async function FacultyTopicWorkspacePage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!WORKSPACE_ROLES.includes(user.role)) redirect("/dashboard");
  const asked = searchParams.tab === "suggestions" ? "proposals" : searchParams.tab;
  const tab = asked === "overlaps" || asked === "proposals" || asked === "checks" ? asked : "workspace";
  const courses = await workspaceCourses(user);
  const se = user.role === "SUBJECT_EXPERT";
  const { received, sent, missingTable } = await suggestionsFor(user);
  const plan = await proposalsFor(user);
  const pending = received.filter((s) => s.status === "PENDING").length + plan.received.filter((p) => ["PENDING", "PARTIAL"].includes(p.status)).length;

  type Item = { id: string; topic: string; subtopic: string | null; note: string | null; status: string; createdAt: string; course: string; from: string; who: string };
  let items: { received: Item[]; sent: Item[] } = { received: [], sent: [] };
  if (tab === "proposals") {
    const ids = Array.from(new Set([...received, ...sent].flatMap((s) => [s.toCourseId, s.fromCourseId]).filter((x): x is string => !!x)));
    const cs = new Map((await prisma.course.findMany({ where: { id: { in: ids.length ? ids : ["none"] } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, `${c.code} — ${c.title}`]));
    const people = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(received.map((s) => s.fromUserId))).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const shape = (s: SuggestionRow): Item => ({ id: s.id, topic: s.topic, subtopic: s.subtopic, note: s.note, status: s.status, createdAt: s.createdAt.toISOString().slice(0, 10), course: cs.get(s.toCourseId) || "", from: s.fromCourseId ? `from ${cs.get(s.fromCourseId) || ""}` : "", who: people.get(s.fromUserId) || "" });
    items = { received: received.map(shape), sent: sent.map(shape) };
  }

  return (
    <Shell roleLabel={se ? "Subject Expert" : "Course Instructor"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Topic Workspace</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12, maxWidth: 980 }}>
        Open any courses of the institute side by side and plan their topics together: reorder, move and copy topics between courses, set each
        topic&apos;s importance, and draw prerequisite or overlap links by dragging one topic onto another. Your own {se ? "plans" : "teaching copies"} change
        when you save; every other plan gets a proposal to its Subject Expert. Confirmed links show on <Link href="/topic-prerequisites">Prerequisite Topics</Link>.
      </p>
      <nav className="tabs no-print" aria-label="Topic Workspace" style={{ marginBottom: 14 }}>
        <Link href="/faculty/topic-workspace" className="tab" aria-current={tab === "workspace" ? "page" : undefined}>Workspace</Link>
        <Link href="/faculty/topic-workspace?tab=checks" className="tab" aria-current={tab === "checks" ? "page" : undefined}>Checks &amp; program map</Link>
        <Link href="/faculty/topic-workspace?tab=proposals" className="tab" aria-current={tab === "proposals" ? "page" : undefined}>Proposals{pending ? ` (${pending})` : ""}</Link>
        <Link href="/faculty/topic-workspace?tab=overlaps" className="tab" aria-current={tab === "overlaps" ? "page" : undefined}>Overlaps &amp; prerequisite chain</Link>
      </nav>
      {missingTable && tab === "proposals" && <div className="err">The topic suggestion table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
      {tab === "workspace" && <FacultyTopicWorkspace role={user.role} />}
      {tab === "checks" && <TopicChecksPanel />}
      {tab === "proposals" && <TopicProposalsPanel legacy={items.received.length || items.sent.length ? <div className="card" style={{ marginTop: 16 }}><h3 style={{ fontSize: 15, marginTop: 0 }}>Single-topic suggestions</h3><TopicSuggestionsPanel received={items.received} sent={items.sent} /></div> : null} />}
      {tab === "overlaps" && <div className="card"><TopicOverlapGraph courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category }))} /></div>}
    </Shell>
  );
}
