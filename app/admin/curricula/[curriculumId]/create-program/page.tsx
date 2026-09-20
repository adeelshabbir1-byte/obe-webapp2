import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import ProgramCopyBuilder from "../../../../../components/ProgramCopyBuilder";

const NAV = [
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Curriculum Migration" },
];

export default async function CreateProgramPage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") redirect("/login");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: { courses: { orderBy: [{ category: "asc" }, { domain: "asc" }, { title: "asc" }] } },
  });
  if (!curriculum) notFound();

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>Create Program Copy</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
          From: {curriculum.authority} {curriculum.title} ({curriculum.version})
        </div>
        <a href={`/admin/curricula/${curriculum.id}`} style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to curriculum</a>
      </div>

      <ProgramCopyBuilder
        sourceCurriculumId={curriculum.id}
        courses={curriculum.courses.map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.category, domain: c.domain, semesterNumber: c.semesterNumber }))}
      />
    </Shell>
  );
}
