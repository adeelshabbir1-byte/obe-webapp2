import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CurriculaManager from "../../../components/CurriculaManager";

const NAV = [
  { href: "/admin/users", label: "Manage Chairmen" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
];

export default async function AdminCurriculaPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const curricula = await prisma.masterCurriculum.findMany({
    orderBy: [{ authority: "asc" }, { title: "asc" }, { version: "desc" }],
    include: { _count: { select: { courses: true, plos: true } } },
  });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Master Curricula</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Manage the official curricula available for institutions to import. Clone a curriculum as a
        new version when it's updated — the original stays intact for batches that already imported it.
      </p>
      <CurriculaManager
        initialCurricula={curricula.map((c) => ({ id: c.id, authority: c.authority, title: c.title, version: c.version, courseCount: c._count.courses, ploCount: c._count.plos }))}
      />
    </Shell>
  );
}
