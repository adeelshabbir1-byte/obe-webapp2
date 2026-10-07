import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CurriculaManager from "../../../components/CurriculaManager";
import { degreeSortKey, degreeGroupLabel } from "../../../lib/degreeGroup";

const NAV = [
  { href: "/admin/users", label: "Manage Chairmen" },
  { href: "/admin/account-requests", label: "Account Requests" },
  { href: "/admin/curricula", label: "Master Curricula" }, { href: "/admin/master-experts", label: "Master Curriculum Experts" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function AdminCurriculaPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  // Official (shared) curricula only - institutes' own copies are theirs, not managed here.
  const curricula = (await prisma.masterCurriculum.findMany({
    where: { chairmanId: null },
    include: { _count: { select: { courses: true, plos: true, assignments: true } } },
  })).sort((a, b) => degreeSortKey(a).localeCompare(degreeSortKey(b)) || a.authority.localeCompare(b.authority) || b.version.localeCompare(a.version));

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Master Curricula</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Manage the official curricula and choose which institutes each one is assigned to — institutes only see the curricula you assign to them. Grouped by degree, so every BSCS curriculum sits together. Clone a curriculum as a
        new version when it's updated — the original stays intact for batches that already imported it.
      </p>
      <CurriculaManager
        initialCurricula={curricula.map((c) => ({ id: c.id, authority: c.authority, title: c.title, version: c.version, courseCount: c._count.courses, ploCount: c._count.plos, degreeGroup: degreeGroupLabel(c), assignedCount: c._count.assignments }))}
      />
    </Shell>
  );
}
