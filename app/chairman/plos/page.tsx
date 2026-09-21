import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import ChairmanPlosManager from "../../../components/ChairmanPlosManager";

const NAV = [
  { href: "/chairman/coordinators", label: "Program Coordinators" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" },
  { href: "/chairman/assigners", label: "Course Assigners" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" },
  { href: "/chairman/ai-configuration", label: "AI Configuration" }, { href: "/omc/reports", label: "Reports" },
];

export default async function ChairmanPlosPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { coordinator: true, batch: true },
    orderBy: [{ coordinatorId: "asc" }, { batchId: "asc" }, { number: "asc" }],
  });

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Learning Outcomes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Review, edit, and formally approve the PLOs your Program Coordinators have defined, per batch/cohort.
      </p>
      <ChairmanPlosManager
        initialPlos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, description: p.description, status: p.status, chairmanComment: p.chairmanComment, coordinatorName: p.coordinator.name, degreeProgram: p.batch ? `${p.batch.degreeProgram} — ${p.batch.batchName}` : "" }))}
      />
    </Shell>
  );
}
