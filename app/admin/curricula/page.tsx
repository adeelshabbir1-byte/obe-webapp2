import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CurriculaManager from "../../../components/CurriculaManager";
import AssignByInstitute from "../../../components/AssignByInstitute";
import { degreeSortKey, degreeGroupLabel } from "../../../lib/degreeGroup";
import { navForRole } from "../../../components/reportNav";
import CurriculumWorkbookImport from "../../../components/CurriculumWorkbookImport";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";


export default async function AdminCurriculaPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!(await adminCan(user, "CURRICULUM"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);

  // Official (shared) curricula only - institutes' own copies are theirs, not managed here.
  const curricula = (await prisma.masterCurriculum.findMany({
    where: { chairmanId: null },
    include: { _count: { select: { courses: true, plos: true, assignments: true } } },
  })).sort((a, b) => degreeSortKey(a).localeCompare(degreeSortKey(b)) || a.authority.localeCompare(b.authority) || b.version.localeCompare(a.version));

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Master Curricula</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Manage the official curricula and choose which institutes each one is assigned to — institutes only see the curricula you assign to them. Grouped by degree, so every BSCS curriculum sits together. Clone a curriculum as a
        new version when it's updated — the original stays intact for batches that already imported it.
      </p>
      <p style={{ fontSize: 13 }}><a href="/curricula">Open the Curriculum Library</a> to filter, compare versions and give every curriculum its standard code · <a href="/curricula/tidy">Name &amp; tidy up</a> · <a href="/admin/affiliations">Affiliated colleges</a></p>
      <CurriculumWorkbookImport official={true} />
      <AssignByInstitute />
      <CurriculaManager
        initialCurricula={curricula.map((c) => ({ id: c.id, authority: c.authority, title: c.title, version: c.version, courseCount: c._count.courses, ploCount: c._count.plos, degreeGroup: degreeGroupLabel(c), assignedCount: c._count.assignments }))}
      />
    </Shell>
  );
}
