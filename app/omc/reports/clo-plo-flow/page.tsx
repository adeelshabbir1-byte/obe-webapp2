import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import CloPloFlowView from "../../../../components/CloPloFlowView";
import { loadPlansBulk, comparePlans, courseIdsForInstructor, type PlanData } from "../../../../lib/planCompare";

export default async function CloPloFlowPage({ searchParams }: { searchParams: { courseId?: string; all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.clo-plo-flow"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  // An Instructor sees only the courses he teaches, plus courses equivalent
  // to them (same combined-class group). Everyone else sees their whole scope.
  const instructorCourseIds = user.role === "INSTRUCTOR" ? await courseIdsForInstructor(user.id) : null;
  const allCourses = await prisma.course.findMany({
    where: instructorCourseIds ? { id: { in: instructorCourseIds } } : { coordinatorId: { in: coordinatorIds } },
    include: { batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: { code: "asc" },
  });
  // Both plans for every course: the Subject Expert's and the Instructor's own copy.
  const allIds = allCourses.map((c) => c.id);
  const plans = await loadPlansBulk(allIds);
  const isReady = (p: PlanData) => p.assessments.length > 0 && p.clos.some((c) => c.mappedPloId);
  // Only courses that actually have something to show (in either plan);
  // otherwise the picker is a long list of courses that open to an empty diagram.
  const readyIds = new Set(allCourses.filter((c) => { const p = plans.get(c.id)!; return isReady(p.se) || isReady(p.instructor); }).map((c) => c.id));
  const diffCount = new Map(allCourses.map((c) => { const p = plans.get(c.id)!; return [c.id, comparePlans(p.se, p.instructor).differences.length] as const; }));
  const ready = allCourses.filter((c) => readyIds.has(c.id));
  const showAll = searchParams.all === "1";
  // A course opened by direct link stays selectable even if it isn't "ready".
  const courses = showAll ? allCourses : allCourses.filter((c) => readyIds.has(c.id) || c.id === searchParams.courseId);
  const hiddenCount = allCourses.length - ready.length;
  const flaggedCount = ready.filter((c) => (diffCount.get(c.id) || 0) > 0).length;
  const selectedCourseId = searchParams.courseId || courses[0]?.id || "";

  const selectedPlans = plans.get(selectedCourseId) || { se: { assessments: [], clos: [], plos: [], exists: false }, instructor: { assessments: [], clos: [], plos: [], exists: false } };
  const comparison = comparePlans(selectedPlans.se, selectedPlans.instructor);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Assessment → CLO → PLO Flow" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        How each assessment's marks flow through to CLOs, and each CLO's contribution flows through to PLOs.
        Thicker, more saturated lines carry more weight.
      </p>

      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} hidden={showAll ? { all: "1" } : undefined} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}${c.batch ? ` (${c.batch.degreeProgram} · ${c.batch.batchName})` : ""}${readyIds.has(c.id) ? "" : " — incomplete"}${(diffCount.get(c.id) || 0) > 0 ? " — ⚑ plans differ" : ""}` }))} />
        <span style={{ fontSize: 11.5, color: "var(--slate)", marginLeft: 12 }}>
          {showAll ? `Showing all ${allCourses.length} courses.` : `Showing ${ready.length} course(s) with assessments and CLO→PLO mapping defined.`}{" "}
          {flaggedCount > 0 && <strong style={{ color: "#B26B00" }}>⚑ {flaggedCount} course(s) where the Instructor's plan differs from the Subject Expert's.{" "}</strong>}
          {hiddenCount > 0 && (showAll
            ? <a href={`?${searchParams.courseId ? `courseId=${searchParams.courseId}` : ""}`}>Show only complete courses</a>
            : <a href={`?all=1${searchParams.courseId ? `&courseId=${searchParams.courseId}` : ""}`}>Show all ({hiddenCount} hidden)</a>)}
        </span>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {selectedCourseId === "" ? (
          <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No courses to show yet.</p>
        ) : (
          <CloPloFlowView
            key={selectedCourseId}
            se={selectedPlans.se} instructor={selectedPlans.instructor}
            differences={comparison.differences}
            seChanged={Array.from(comparison.seChanged)} instructorChanged={Array.from(comparison.instructorChanged)}
            instructorStarted={comparison.instructorStarted}
            initialMode={user.role === "INSTRUCTOR" && comparison.instructorStarted ? "COMPARE" : "SE"}
          />
        )}
      </div>
    </Shell>
  );
}
