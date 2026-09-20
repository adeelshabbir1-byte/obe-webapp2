import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import PloMatrix from "../../../components/PloMatrix";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";
import CopyPloMappingsForm from "../../../components/CopyPloMappingsForm";
import AutoMapHecButton from "../../../components/AutoMapHecButton";
import AutoMapHecAllButton from "../../../components/AutoMapHecAllButton";

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
  // Loading every batch's PLOs/courses/HEC suggestions at once — the
  // old default when neither filter was picked — meant a sequential
  // loop over the institution's ENTIRE batch list, several queries
  // each. With 40+ batches across every program that's well past a
  // reasonable page load, and is very plausibly what "the page never
  // opens" actually was. A specific batch or degree must be chosen
  // before any of that work runs at all now.
  const hasFilter = !!(searchParams.batchId || searchParams.degree);
  const batches = hasFilter ? allBatches.filter((b) => {
    if (searchParams.batchId) return b.id === searchParams.batchId;
    return b.degreeProgram === searchParams.degree;
  }) : [];

  const programs = [];
  for (const batch of batches) {
    const courses = await prisma.course.findMany({
      where: { batchId: batch.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true, masterCourse: { select: { code: true } } },
    });
    const assignerIds = Array.from(new Set(courses.flatMap((c) => c.ploMappings.map((m) => m.assignedById)).filter((id): id is string => !!id)));
    const assigners = assignerIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: assignerIds } } }) : [];
    const assignerNameById = new Map(assigners.map((a) => [a.id, a.name]));
    const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" } });
    if (courses.length === 0 && plos.length === 0) continue;

    // Prefer each course's explicitly-linked MasterCourse's own code
    // over the course's own code string — HEC suggestions are keyed by
    // HEC's code convention, which often doesn't match what actually
    // got imported as this course's local code, so relying on the
    // course's own code alone silently misses most matches.
    const lookupCode = (c: (typeof courses)[number]) => c.masterCourse?.code || c.code;
    const hecSuggestions = await prisma.hecPloSuggestion.findMany({ where: { courseCode: { in: courses.map(lookupCode) } } });
    const hecByCode = new Map<string, number[]>();
    for (const s of hecSuggestions) hecByCode.set(s.courseCode, [...(hecByCode.get(s.courseCode) || []), s.ploNumber]);

    programs.push({
      coordinatorId: batch.id, coordinatorName: `${batch.degreeProgram} — ${batch.batchName}`,
      plos: plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
      courses: courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
        mappedPloIds: c.ploMappings.map((m) => m.ploId),
        assignedByPloId: Object.fromEntries(c.ploMappings.map((m) => [m.ploId, m.assignedById ? assignerNameById.get(m.assignedById) || null : null])),
        hecSuggestedPloNumbers: hecByCode.get(lookupCode(c)) || [],
      })),
    });
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO–Course Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign which PLOs each course contributes to — scoped one batch/cohort at a time, since even two intakes
        of the same degree can have different PLOs. Cells shaded <span style={{ background: "#FFF9C4", padding: "1px 5px" }}>yellow</span> with a small "HEC" label are HEC's own suggested mapping for that course — a hint only, not automatically applied; check the box yourself to actually set it.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <AutoMapHecAllButton />
      {!hasFilter && (
        <div className="card">
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Select a program or a specific batch above to load its PLO-Course Matrix.</p>
        </div>
      )}
      {hasFilter && searchParams.batchId && <AutoMapHecButton batchId={searchParams.batchId} />}
      {hasFilter && allBatches.length > 1 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Copy Mappings from Another Batch</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
            If two batches share the same or an equivalent curriculum, copy one's PLO mappings into the other —
            matched by course code and PLO number. Only fills in gaps; never overwrites what's already set.
          </p>
          <CopyPloMappingsForm batches={allBatches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} />
        </div>
      )}
      {hasFilter && <PloMatrix programs={programs} />}
    </Shell>
  );
}
