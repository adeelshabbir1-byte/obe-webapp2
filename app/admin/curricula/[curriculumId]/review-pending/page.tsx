import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import PendingCourseReview from "../../../../../components/PendingCourseReview";

const NAV = [
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Curriculum Migration" },
];

function normalize(title: string) {
  return title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export default async function ReviewPendingPage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") redirect("/login");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: {
      courses: { orderBy: { title: "asc" } },
      pendingCourses: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { clos: { orderBy: { orderIndex: "asc" } } } },
    },
  });
  if (!curriculum) notFound();

  // Simple fuzzy match: normalized substring containment either direction
  const existingNormalized = curriculum.courses.map((c) => ({ id: c.id, title: c.title, norm: normalize(c.title) }));
  const pendingWithSuggestions = curriculum.pendingCourses.map((p) => {
    const norm = normalize(p.title);
    const suggestions = existingNormalized
      .filter((e) => norm.length > 5 && e.norm.length > 5 && (norm.includes(e.norm) || e.norm.includes(norm)))
      .slice(0, 3);
    return { ...p, suggestions };
  });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Review Pending Courses</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
          {curriculum.authority} {curriculum.title} ({curriculum.version}) — {pendingWithSuggestions.length} awaiting review
        </div>
        <a href={`/admin/curricula/${curriculum.id}`} style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to curriculum</a>
      </div>

      <PendingCourseReview curriculumId={curriculum.id} pendingCourses={pendingWithSuggestions} allCourses={curriculum.courses.map((c) => ({ id: c.id, title: c.title, category: c.category }))} />
    </Shell>
  );
}
