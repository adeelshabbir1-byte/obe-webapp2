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
import AutoMapSystemButton from "../../../components/AutoMapSystemButton";
import AutoMapCloLevelButton from "../../../components/AutoMapCloLevelButton";
import AutoMapCloLevelAllButton from "../../../components/AutoMapCloLevelAllButton";
import AutoMapSystemAllButton from "../../../components/AutoMapSystemAllButton";
import PloMatrixExcelButtons from "../../../components/PloMatrixExcelButtons";
import { deptScope } from "../../../lib/omcScope";
import { batchScopeFor, nameCollegeBatches } from "../../../lib/reportScope";
import SetupStrip from "../../../components/SetupStrip";
import { navForRole } from "../../../components/reportNav";
import { LIST_TYPES } from "../../../lib/autoCopyPreviousBatch";

export default async function OmcPloMatrixPage({ searchParams }: { searchParams: { degree?: string; batchId?: string; setup?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role === "PROGRAM_COORDINATOR") return leadView(user, searchParams);
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) },
    orderBy: { name: "asc" },
  });
  const coordinatorIds = coordinators.map((c) => c.id);

  // Grouped by BATCH directly — a course already belongs to exactly one
  // batch, and PLOs are now scoped per batch too, so this is a clean 1:1 match.
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds }, ...batchScopeFor(user) }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  await nameCollegeBatches(user, allBatches);
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
        sourceByPloId: Object.fromEntries(c.ploMappings.map((m) => [m.ploId, m.source])),
        hecSuggestedPloNumbers: hecByCode.get(lookupCode(c)) || [],
      })),
    });
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA–Course Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign which GAs each course contributes to — scoped one batch/cohort at a time, since even two intakes
        of the same degree can have different GAs. Cells shaded <span style={{ background: "#FFF9C4", padding: "1px 5px" }}>yellow</span> with a small "HEC" label are HEC's own suggested mapping for that course — a hint only, not automatically applied; check the box yourself to actually set it.
        If a course is the base of a Content Sync group, checking or unchecking a box here also applies to that
        same course's not-yet-taught future batches automatically.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>
      <AutoMapHecAllButton />
      <AutoMapSystemAllButton />
      <AutoMapCloLevelAllButton />
      {!hasFilter && (
        <div className="card">
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Select a program or a specific batch above to load its GA-Course Matrix.</p>
        </div>
      )}
      {hasFilter && searchParams.batchId && <PloMatrixExcelButtons batchId={searchParams.batchId} />}
      {hasFilter && searchParams.batchId && <AutoMapHecButton batchId={searchParams.batchId} />}
      {hasFilter && searchParams.batchId && <AutoMapSystemButton batchId={searchParams.batchId} />}
      {hasFilter && searchParams.batchId && <AutoMapCloLevelButton batchId={searchParams.batchId} />}
      {hasFilter && allBatches.length > 1 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Copy Mappings from Another Batch</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
            If two batches share the same or an equivalent curriculum, copy one's GA mappings into the other —
            matched by course code and GA number. Only fills in gaps; never overwrites what's already set.
          </p>
          <CopyPloMappingsForm batches={allBatches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} />
        </div>
      )}
      {hasFilter && <PloMatrix programs={programs} />}
    </Shell>
  );
}

// Step 12 of a batch's set-up: the Program Lead checks the GA mapping read-only (the OMC decides it here) and sees warnings.
async function leadView(user: { id: string; name: string; role: string }, searchParams: { batchId?: string; setup?: string }) {
  const batch = searchParams.batchId ? await prisma.batch.findFirst({ where: { id: searchParams.batchId, coordinatorId: user.id }, select: { id: true, degreeProgram: true, batchName: true } }) : null;
  if (!batch) redirect("/coordinator/batches");
  const [plos, courses] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    prisma.course.findMany({ where: { batchId: batch.id, courseType: { notIn: LIST_TYPES } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, semesterNumber: true, ploMappings: { select: { ploId: true } }, clos: { where: { source: "SE" }, select: { mappedPloId: true } } } }),
  ]);
  const noGa = courses.filter((c) => !c.ploMappings.length);
  const unused = plos.filter((p) => !courses.some((c) => c.ploMappings.some((m) => m.ploId === p.id)));
  const offMap = courses.filter((c) => c.clos.some((x) => x.mappedPloId && !c.ploMappings.some((m) => m.ploId === x.mappedPloId)));
  const warnings = [
    ...(plos.length ? [] : ["The batch has no GAs yet."]),
    ...(noGa.length ? [`${noGa.length} course(s) contribute to no GA: ${noGa.map((c) => c.code).join(", ")}.`] : []),
    ...(unused.length ? [`${unused.length} GA(s) no course serves: ${unused.map((p) => `GA-${p.number}`).join(", ")}.`] : []),
    ...(offMap.length ? [`${offMap.length} course(s) have CLOs pointing at a GA the course isn't mapped to: ${offMap.map((c) => c.code).join(", ")}.`] : []),
  ];
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      {searchParams.setup === batch.id && <SetupStrip batchId={batch.id} step={12} finish="GA mapping checked →" />}
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA–Course Matrix · {batch.degreeProgram} {batch.batchName}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Which GAs each course contributes to. The OMC decides this mapping here during its review; you check it. Warnings only — nothing here blocks the set-up.</p>
      <div className="card" style={{ borderLeft: `5px solid ${warnings.length ? "#B26A00" : "#2E7D32"}` }}>
        {warnings.length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <b>No warnings — every course serves a GA and every GA is served.</b>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Course</th><th>Sem</th>{plos.map((p) => <th key={p.id} title={p.title} style={{ textAlign: "center" }}>GA-{p.number}</th>)}</tr></thead>
          <tbody>{courses.map((c) => <tr key={c.id}><td><b>{c.code}</b> {c.title}</td><td>{c.semesterNumber ?? "—"}</td>{plos.map((p) => <td key={p.id} style={{ textAlign: "center", color: "#1E6B34" }}>{c.ploMappings.some((m) => m.ploId === p.id) ? "✓" : ""}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Shell>
  );
}
