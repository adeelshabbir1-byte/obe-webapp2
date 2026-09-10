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

export default async function CloPloFlowPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.clo-plo-flow"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";

  const [instruments, clos, links] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: selectedCourseId, source: "SE" } }),
    prisma.cLO.findMany({ where: { courseId: selectedCourseId, source: "SE" }, include: { mappedPlo: true } }),
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
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
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
