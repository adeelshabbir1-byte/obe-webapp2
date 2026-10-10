import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CustodianPicker from "../../../components/CustodianPicker";
import { navForRole } from "../../../components/reportNav";


export default async function AlumniCustodianPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { managedById: user.id, role: "PROGRAM_COORDINATOR" } });
  const faculty = await prisma.user.findMany({
    where: { managedById: { in: coordinators.map((c) => c.id) }, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } },
    orderBy: { name: "asc" },
  });
  const all = [...coordinators, ...faculty];
  const current = all.find((u) => u.isAlumniCustodian);

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Alumni Data Custodian</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign who reviews alumni and employer data submitted by your faculty.
      </p>
      <CustodianPicker candidates={all.map((u) => ({ id: u.id, name: u.name, role: u.role }))} currentCustodianId={current?.id || null} />
    </Shell>
  );
}
