import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import PloMatrix from "../../../components/PloMatrix";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";
import CopyPloMappingsForm from "../../../components/CopyPloMappingsForm";

export default async function OmcPloMatrixPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
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
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batches = allBatches.filter((b) => {
    if (searchParams.batchId) return b.id === searchParams.batchId;
    if (searchParams.degree) return b.degreeProgram === searchParams.degree;
    return true;
  });

  const programs = [];
  for (const batch of batches) {
    const courses = await prisma.course.findMany({
      where: { batchId: batch.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    const assignerIds = Array.from(new Set(courses.flatMap((c) => c.ploMappings.map((m) => m.assignedById)).filter((id): id is string => !!id)));
    const assigners = assignerIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: assignerIds } } }) : [];
    const assignerNameById = new Map(assigners.map((a) => [a.id, a.name]));
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    if (courses.length === 0 && plos.length === 0) continue;
    programs.push({
      coordinatorId: batch.id, coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`,
      plos: plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
      courses: courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
        mappedPloIds: c.ploMappings.map((m) => m.ploId),
        assignedByPloId: Object.fromEntries(c.ploMappings.map((m) => [m.ploId, m.assignedById ? assignerNameById.get(m.assignedById) || null : null])),
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
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      {allBatches.length > 1 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Copy Mappings from Another Batch</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
            If two batches share the same or an equivalent curriculum, copy one's PLO mappings into the other —
            matched by course code and PLO number. Only fills in gaps; never overwrites what's already set.
          </p>
          <CopyPloMappingsForm batches={allBatches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} />
        </div>
      )}
      <PloMatrix programs={programs} />
    </Shell>
  );
}
