import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PlatformExpertsManager from "../../../components/PlatformExpertsManager";
import { ADMIN_NAV } from "../../../components/adminNav";

export default async function MasterExpertsPage({ searchParams }: { searchParams: { curriculumId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const [experts, curricula] = await Promise.all([
    prisma.user.findMany({ where: { role: "SUBJECT_EXPERT", isPlatformExpert: true }, orderBy: { createdAt: "desc" } }),
    prisma.masterCurriculum.findMany({ where: { chairmanId: null }, orderBy: [{ title: "asc" }, { version: "desc" }] }),
  ]);
  const curriculumId = searchParams.curriculumId || curricula[0]?.id || "";
  const courses = curriculumId ? await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }) : [];

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={ADMIN_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Master Curriculum Experts</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Create Subject Experts who belong to no institute and design courses of the official Master Curriculum for every institute. Then assign each
        course to the expert who should write it.
      </p>
      <PlatformExpertsManager
        experts={experts.map((e) => ({ id: e.id, name: e.name, username: e.username, organization: e.organization }))}
        curricula={curricula.map((c) => ({ id: c.id, label: `${c.title} (${c.version})` }))}
        curriculumId={curriculumId}
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber, designerId: c.designerId }))}
      />
    </Shell>
  );
}
