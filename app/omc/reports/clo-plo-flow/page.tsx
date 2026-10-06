import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import CloPloFlowDiagram from "../../../../components/CloPloFlowDiagram";

export default async function CloPloFlowPage({ searchParams }: { searchParams: { courseId?: string; all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.clo-plo-flow"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: { code: "asc" },
  });
  // Only courses that actually have something to show: at least one
  // assessment AND at least one CLO mapped to a PLO. Otherwise the picker is
  // a long list of courses that open to an empty diagram.
  const allIds = allCourses.map((c) => c.id);
  const [withInstruments, withMappedClos] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: allIds }, source: "SE" }, select: { courseId: true }, distinct: ["courseId"] }),
    prisma.cLO.findMany({ where: { courseId: { in: allIds }, source: "SE", mappedPloId: { not: null } }, select: { courseId: true }, distinct: ["courseId"] }),
  ]);
  const hasInstruments = new Set(withInstruments.map((r) => r.courseId));
  const hasMapped = new Set(withMappedClos.map((r) => r.courseId));
  const ready = allCourses.filter((c) => hasInstruments.has(c.id) && hasMapped.has(c.id));
  const showAll = searchParams.all === "1";
  // A course opened by direct link stays selectable even if it isn't "ready".
  const courses = showAll ? allCourses : allCourses.filter((c) => (hasInstruments.has(c.id) && hasMapped.has(c.id)) || c.id === searchParams.courseId);
  const hiddenCount = allCourses.length - ready.length;
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";

  const [instruments, clos, links] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: selectedCourseId, source: "SE" } }),
    prisma.cLO.findMany({ where: { courseId: selectedCourseId, source: "SE" }, include: { mappedPlo: true }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: selectedCourseId, source: "SE" } }, include: { lectureRow: true } }),
  ]);
  const instrumentToClo = new Map<string, string>();
  for (const link of links) if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);

  const assessments = instruments.map((i) => ({ id: i.id, label: i.label, type: i.type, marksPct: i.marksPct, cloId: instrumentToClo.get(i.id) || null }));
  const cloData = clos.map((c) => ({ id: c.id, code: c.code, mappedPloId: c.mappedPloId, contributionPct: c.ploContributionPct }));
  const plos = Array.from(new Map(clos.filter((c) => c.mappedPlo).map((c) => [c.mappedPlo!.id, c.mappedPlo!])).values()).map((p) => ({ id: p.id, number: p.number, title: p.title }));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Assessment → CLO → PLO Flow" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        How each assessment's marks flow through to CLOs, and each CLO's contribution flows through to PLOs.
        Thicker, more saturated lines carry more weight.
      </p>

      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} hidden={showAll ? { all: "1" } : undefined} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}${c.batch ? ` (${c.batch.degreeProgram} · ${c.batch.batchName})` : ""}${hasInstruments.has(c.id) && hasMapped.has(c.id) ? "" : " — incomplete"}` }))} />
        <span style={{ fontSize: 11.5, color: "var(--slate)", marginLeft: 12 }}>
          {showAll ? `Showing all ${allCourses.length} courses.` : `Showing ${ready.length} course(s) with assessments and CLO→PLO mapping defined.`}{" "}
          {hiddenCount > 0 && (showAll
            ? <a href={`?${searchParams.courseId ? `courseId=${searchParams.courseId}` : ""}`}>Show only complete courses</a>
            : <a href={`?all=1${searchParams.courseId ? `&courseId=${searchParams.courseId}` : ""}`}>Show all ({hiddenCount} hidden)</a>)}
        </span>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {assessments.length === 0 ? (
          <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No assessments defined for this course yet.</p>
        ) : (
          <CloPloFlowDiagram assessments={assessments} clos={cloData} plos={plos} />
        )}
      </div>
    </Shell>
  );
}
