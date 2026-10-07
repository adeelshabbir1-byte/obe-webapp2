import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FacultiesManager from "../../../components/FacultiesManager";

export default async function ChairmanFacultiesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [faculties, departments] = await Promise.all([
    prisma.faculty.findMany({ where: { chairmanId: user.id }, include: { deans: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }),
  ]);
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculties &amp; Deans</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Institute → Faculty (Dean) → Department (Chairman) → Program (Program Lead).</p>
      <FacultiesManager
        faculties={faculties.map((f) => ({ id: f.id, name: f.name, deans: f.deans.map((d) => d.name) }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />
    </Shell>
  );
}
