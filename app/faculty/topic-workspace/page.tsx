import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FacultyTopicWorkspace from "../../../components/FacultyTopicWorkspace";
import TopicOverlapGraph from "../../../components/TopicOverlapGraph";
import TopicSuggestionsPanel from "../../../components/TopicSuggestionsPanel";
import { workspaceCourses, WORKSPACE_ROLES } from "../../../lib/facultyTopicWorkspace";
import { suggestionsFor, type SuggestionRow } from "../../../lib/topicSuggestions";

export const dynamic = "force-dynamic";

export default async function FacultyTopicWorkspacePage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!WORKSPACE_ROLES.includes(user.role)) redirect("/dashboard");
  const tab = searchParams.tab === "overlaps" || searchParams.tab === "suggestions" ? searchParams.tab : "workspace";
  const courses = await workspaceCourses(user);
  const se = user.role === "SUBJECT_EXPERT";
  const { received, sent, missingTable } = await suggestionsFor(user);
  const pending = received.filter((s) => s.status === "PENDING").length;

  type Item = { id: string; topic: string; subtopic: string | null; note: string | null; status: string; createdAt: string; course: string; from: string; who: string };
  let items: { received: Item[]; sent: Item[] } = { received: [], sent: [] };
  if (tab === "suggestions") {
    const ids = Array.from(new Set([...received, ...sent].flatMap((s) => [s.toCourseId, s.fromCourseId]).filter((x): x is string => !!x)));
    const cs = new Map((await prisma.course.findMany({ where: { id: { in: ids.length ? ids : ["none"] } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, `${c.code} — ${c.title}`]));
    const people = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(received.map((s) => s.fromUserId))).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const shape = (s: SuggestionRow): Item => ({ id: s.id, topic: s.topic, subtopic: s.subtopic, note: s.note, status: s.status, createdAt: s.createdAt.toISOString().slice(0, 10), course: cs.get(s.toCourseId) || "", from: s.fromCourseId ? `from ${cs.get(s.fromCourseId) || ""}` : "", who: people.get(s.fromUserId) || "" });
    items = { received: received.map(shape), sent: sent.map(shape) };
  }

  return (
    <Shell roleLabel={se ? "Subject Expert" : "Course Instructor"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Topic Workspace</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12, maxWidth: 920 }}>
        Build the topics of your {se ? "assigned courses (their lecture plans)" : "semester courses (your delivery plan)"} with any course of the institute beside them:
        reorder and move your own topics, copy topics in from other courses, and suggest topics to courses you don&apos;t teach — especially the courses
        before and after yours in the prerequisite chain. Link prerequisite topics on <Link href="/topic-prerequisites">Prerequisite Topics</Link>.
      </p>
      <nav className="tabs no-print" aria-label="Topic Workspace" style={{ marginBottom: 14 }}>
        <Link href="/faculty/topic-workspace" className="tab" aria-current={tab === "workspace" ? "page" : undefined}>Workspace</Link>
        <Link href="/faculty/topic-workspace?tab=overlaps" className="tab" aria-current={tab === "overlaps" ? "page" : undefined}>Overlaps &amp; prerequisite chain</Link>
        <Link href="/faculty/topic-workspace?tab=suggestions" className="tab" aria-current={tab === "suggestions" ? "page" : undefined}>Suggestions{pending ? ` (${pending})` : ""}</Link>
      </nav>
      {missingTable && tab !== "workspace" && <div className="err">The topic suggestion table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
      <div className="card">
        {tab === "workspace" && <FacultyTopicWorkspace courses={courses} />}
        {tab === "overlaps" && <TopicOverlapGraph courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category }))} />}
        {tab === "suggestions" && <TopicSuggestionsPanel received={items.received} sent={items.sent} />}
      </div>
    </Shell>
  );
}
