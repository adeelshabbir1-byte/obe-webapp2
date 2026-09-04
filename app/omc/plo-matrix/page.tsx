import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import PloMatrix from "../../../components/PloMatrix";



export default async function OmcPloMatrixPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" },
    orderBy: { name: "asc" },
  });
  const coordinatorIds = coordinators.map((c) => c.id);

  // Grouped by BATCH directly — a course already belongs to exactly one
  // batch, and PLOs are now scoped per batch too, so this is a clean 1:1 match.
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  const programs = [];
  for (const batch of batches) {
    const courses = await prisma.course.findMany({
      where: { batchId: batch.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    if (courses.length === 0 && plos.length === 0) continue;
    programs.push({
      coordinatorId: batch.id, coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`,
      plos: plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
      courses: courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
        mappedPloIds: c.ploMappings.map((m) => m.ploId),
      })),
    });
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO–Course Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign which PLOs each course contributes to — scoped one batch/cohort at a time, since even two intakes
        of the same degree can have different PLOs.
      </p>
      <PloMatrix programs={programs} />
    </Shell>
  );
}
