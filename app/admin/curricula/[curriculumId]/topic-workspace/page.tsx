import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import TopicWorkspace from "../../../../../components/TopicWorkspace";
import Link from "next/link";

const NAV = [
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Curriculum Migration" },
];

export default async function TopicWorkspacePage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") redirect("/login");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: { courses: { orderBy: [{ category: "asc" }, { domain: "asc" }, { title: "asc" }], include: { _count: { select: { seedTopics: true } } } } },
  });
  if (!curriculum) notFound();

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Topic Workspace</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
          {curriculum.authority} {curriculum.title} ({curriculum.version}) — pick 2 or 3 courses, then drag topics between their lecture plans
        </div>
        <Link href={`/admin/curricula/${curriculum.id}`} style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to curriculum</Link>
      </div>

      <TopicWorkspace
        curriculumId={curriculum.id}
        courses={curriculum.courses.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category, topicCount: c._count.seedTopics }))}
      />
    </Shell>
  );
}
