import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import CurriculumDetailManager from "../../../../components/CurriculumDetailManager";

const NAV = [
  { href: "/admin/users", label: "Manage Chairmen" },
  { href: "/admin/curricula", label: "Master Curricula" },
];

export default async function CurriculumDetailPage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: { courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }, plos: { orderBy: { number: "asc" } } },
  });
  if (!curriculum) notFound();

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{curriculum.authority} {curriculum.title} ({curriculum.version})</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
            {curriculum.sourceReference || "No source reference"}
          </div>
        </div>
        <a href="/admin/curricula" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to Master Curricula</a>
      </div>

      <CurriculumDetailManager
        curriculumId={curriculum.id}
        courses={curriculum.courses.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, category: c.category, semesterNumber: c.semesterNumber }))}
        plos={curriculum.plos.map((p) => ({ id: p.id, number: p.number, title: p.title, description: p.description }))}
      />
    </Shell>
  );
}
