import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import BatchesManager from "../../../components/BatchesManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
];

export default async function BatchesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { _count: { select: { courses: true } } },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Degree Programs & Batches</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Different batches/cohorts can follow different schemes of studies. Create a batch here, then import
        or add courses into it — the same HEC curriculum can be imported fresh for each new batch.
      </p>
      <BatchesManager
        initialBatches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName, courseCount: b._count.courses }))}
      />
    </Shell>
  );
}
