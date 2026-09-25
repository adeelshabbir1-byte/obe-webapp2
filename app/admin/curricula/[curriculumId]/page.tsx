import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import CurriculumDetailManager from "../../../../components/CurriculumDetailManager";
import Link from "next/link";

const NAV = [
  { href: "/admin/users", label: "Manage Chairmen" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function CurriculumDetailPage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: {
      courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], include: { seedClos: { orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true } } } }, prerequisiteCourse: { select: { title: true } } } },
      plos: { orderBy: { number: "asc" } },
    },
  });
  if (!curriculum) notFound();

  const codes = curriculum.courses.map((c) => c.code);
  const suggestions = codes.length > 0 ? await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: codes } } }) : [];
  const ploNumbersByCode = new Map<string, number[]>();
  for (const s of suggestions) ploNumbersByCode.set(s.courseCode, [...(ploNumbersByCode.get(s.courseCode) || []), s.ploNumber]);

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{curriculum.authority} {curriculum.title} ({curriculum.version})</h1>
          <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
            {curriculum.sourceReference || "No source reference"}
          </div>
        </div>
        <Link href="/admin/curricula" className="btn btn-secondary btn-sm">← Back to Master Curricula</Link>
        <Link href={`/admin/curricula/${curriculum.id}/create-program`} className="btn btn-brass" style={{ fontSize: 12.5, marginLeft: 12 }}>Create Program Copy</Link>
        <Link href={`/admin/curricula/${curriculum.id}/plo-matrix`} style={{ marginLeft: 12 }} className="act act-primary">Course–PLO Matrix</Link>
        <Link href={`/admin/curricula/${curriculum.id}/review-pending`} style={{ marginLeft: 12 }} className="act act-primary">Review Pending Courses</Link>
        <Link href={`/admin/curricula/${curriculum.id}/topic-workspace`} style={{ marginLeft: 12 }} className="act act-primary">Topic Workspace</Link>
      </div>

      <CurriculumDetailManager
        curriculumId={curriculum.id}
        courses={curriculum.courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, category: c.category, domain: c.domain, semesterNumber: c.semesterNumber,
          textbook: c.textbook, catalogDescription: c.catalogDescription, referenceMaterial: c.referenceMaterial,
          prerequisiteCourseId: c.prerequisiteCourseId, prerequisiteCourseTitle: c.prerequisiteCourse?.title ?? null,
          seedClos: c.seedClos.map((clo) => ({ id: clo.id, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: clo.orderIndex, mappedPloNumber: clo.mappedPlo?.number ?? null, ploMappingSource: clo.ploMappingSource })),
          suggestedPloNumbers: ploNumbersByCode.get(c.code) || [],
        }))}
        plos={curriculum.plos.map((p) => ({ id: p.id, number: p.number, title: p.title, description: p.description }))}
      />
    </Shell>
  );
}
