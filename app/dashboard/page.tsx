import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheckBig, ShieldCheck } from "lucide-react";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { coordinatorIdsFor, chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import OverviewStatGrid, { Stat } from "../../components/OverviewStatGrid";
import { accentAt, accentText } from "../../lib/accents";
import { greetingName } from "../../lib/names";

export const metadata = { title: "Dashboard" };

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/chairman/coordinators",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  OMC: "/omc/queue",
  INSTRUCTOR: "/instructor/courses",
  COURSE_ASSIGNER: "/assigner/matrix",
};

type Progress = { label: string; done: number; total: number; hint: string };
type Breakdown = { title: string; subtitle: string; items: { label: string; value: number }[] } | null;
type Overview = { stats: Stat[]; progress: Progress[]; breakdown: Breakdown };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes requested",
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected",
};
const statusLabel = (s: string) => STATUS_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1);

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  // A dual-capable Subject Expert who hasn't picked a role for this session yet.
  if (user.rawRole === "SUBJECT_EXPERT" && user.secondaryRole === "INSTRUCTOR" && !user.roleChosen) {
    redirect("/choose-role");
  }

  const { stats, progress, breakdown } = await overviewForRole(user);
  const attention = stats.filter((s) => s.tone === "warn" && s.value > 0).length;
  const firstName = greetingName(user.name);
  const breakdownMax = Math.max(1, ...(breakdown?.items.map((i) => i.value) || [1]));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <section className="hero">
        <div className="hero-row">
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <h1>Welcome back, {firstName}</h1>
            <p>A quick summary of what&apos;s done and what still needs your attention. Click any card to go straight to it.</p>
            <div className="hero-chips">
              <span className="hero-chip"><ShieldCheck size={14} /> {roleLabel(user.role)}</span>
              <span className="hero-chip">
                {attention > 0 ? <CircleAlert size={14} /> : <CircleCheckBig size={14} />}
                {attention > 0 ? `${attention} area${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} attention` : "Everything is on track"}
              </span>
            </div>
            <div style={{ marginTop: 18 }}>
              <Link href={ROLE_HOME[user.role] || "/login"} className="btn btn-brass">
                Go to {roleLabel(user.role)} workspace <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <img className="hero-mark" src="/brand/obehub-mark-v2.webp" alt="" width={120} height={100} />
        </div>
      </section>

      <OverviewStatGrid stats={stats} />

      {(breakdown || progress.length > 0) && (
        <div className="dash-grid">
          {breakdown && (
            <div className="card">
              <div className="panel-title">
                <div>
                  <h3>{breakdown.title}</h3>
                  <p className="small-note" style={{ marginTop: 2 }}>{breakdown.subtitle}</p>
                </div>
              </div>
              {breakdown.items.length === 0 ? (
                <p className="small-note">Nothing to show yet.</p>
              ) : (
                breakdown.items.map((item, i) => {
                  const a = accentAt(i + stats.length);
                  return (
                    <div className="progress-item" key={item.label}>
                      <div className="progress-head">
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.label}>{item.label}</span>
                        <span style={{ color: accentText(a.c) }}>{item.value.toLocaleString()}</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${Math.max(2, (item.value / breakdownMax) * 100)}%`, ["--c" as string]: a.c } as React.CSSProperties} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {progress.length > 0 && (
            <div className="card">
              <div className="panel-title">
                <div>
                  <h3>Completion</h3>
                  <p className="small-note" style={{ marginTop: 2 }}>How much of each area is already done.</p>
                </div>
              </div>
              {progress.map((p, i) => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                const a = accentAt(i + stats.length + (breakdown?.items.length || 0));
                return (
                  <div className="progress-item" key={p.label}>
                    <div className="progress-head">
                      <span>{p.label}</span>
                      <span style={{ color: accentText(a.c) }}>{p.total > 0 ? `${pct}%` : "—"}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%`, ["--c" as string]: a.c } as React.CSSProperties} />
                    </div>
                    <div className="progress-sub">{p.total > 0 ? `${p.done.toLocaleString()} of ${p.total.toLocaleString()} ${p.hint}` : `No ${p.hint} yet`}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

async function overviewForRole(user: { id: string; role: string; managedById: string | null }): Promise<Overview> {
  switch (user.role) {
    case "PROGRAM_COORDINATOR": return coordinatorOverview(user.id);
    case "OMC": return omcOverview(user);
    case "SUBJECT_EXPERT": return subjectExpertOverview(user.id);
    case "INSTRUCTOR": return instructorOverview(user.id);
    case "CHAIRMAN": return chairmanOverview(user.id);
    case "COURSE_ASSIGNER": return courseAssignerOverview(user);
    case "SUPER_USER": return superUserOverview();
    default: return { stats: [], progress: [], breakdown: null };
  }
}

async function coordinatorOverview(coordinatorId: string): Promise<Overview> {
  const [totalCourses, unassignedSe, batches, unconfirmedPrereqs, studentsByBatch] = await Promise.all([
    prisma.course.count({ where: { coordinatorId } }),
    prisma.course.count({ where: { coordinatorId, subjectExpertId: null } }),
    prisma.batch.findMany({ where: { coordinatorId }, select: { id: true, degreeProgram: true, batchName: true } }),
    prisma.batch.count({ where: { coordinatorId, prerequisitesConfirmedAt: null } }),
    prisma.student.groupBy({ by: ["batchId"], where: { batch: { coordinatorId } }, _count: { _all: true } }),
  ]);
  const totalStudents = studentsByBatch.reduce((sum, g) => sum + g._count._all, 0);
  const batchName = new Map(batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));

  return {
    stats: [
      { label: "Courses without a Subject Expert", value: unassignedSe, href: "/coordinator/assign-subject-experts", tone: unassignedSe > 0 ? "warn" : "ok", icon: "subjectExpert" },
      { label: "Batches needing Prerequisite Map review", value: unconfirmedPrereqs, href: "/coordinator/prerequisite-map", tone: unconfirmedPrereqs > 0 ? "warn" : "ok", icon: "map" },
      { label: "Total courses set up", value: totalCourses, href: "/coordinator/courses", tone: "neutral", icon: "courses" },
      { label: "Batches", value: batches.length, href: "/coordinator/batches", tone: "neutral", icon: "batches" },
      { label: "Students on record", value: totalStudents, href: "/coordinator/students", tone: "neutral", icon: "students" },
    ],
    progress: [
      { label: "Subject Expert assignment", done: totalCourses - unassignedSe, total: totalCourses, hint: "courses have a Subject Expert" },
      { label: "Prerequisite maps confirmed", done: batches.length - unconfirmedPrereqs, total: batches.length, hint: "batches confirmed" },
    ],
    breakdown: {
      title: "Students per batch",
      subtitle: "Largest cohorts first",
      items: studentsByBatch
        .map((g) => ({ label: batchName.get(g.batchId) || "Unknown batch", value: g._count._all }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    },
  };
}

async function omcOverview(user: { id: string; role: string; managedById: string | null }): Promise<Overview> {
  const coordinatorIds = await coordinatorIdsFor(user);
  const [pendingReview, coursesWithoutPlo, pendingWeightExceptions, byTemplateStatus] = await Promise.all([
    prisma.pendingMasterCourse.count({ where: { masterCurriculum: { chairmanId: await chairmanIdFor(user) } } }),
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds }, ploMappings: { none: {} } } }),
    prisma.weightExceptionRequest.count({ where: { course: { coordinatorId: { in: coordinatorIds } }, status: "pending" } }),
    prisma.course.groupBy({ by: ["templateStatus"], where: { coordinatorId: { in: coordinatorIds } }, _count: { _all: true } }),
  ]);
  const totalCourses = byTemplateStatus.reduce((sum, g) => sum + g._count._all, 0);

  return {
    stats: [
      { label: "Courses awaiting review", value: pendingReview, href: "/omc/master-curriculum", tone: pendingReview > 0 ? "warn" : "ok", icon: "review" },
      { label: "Courses with no PLO mapped yet", value: coursesWithoutPlo, href: "/omc/plo-matrix", tone: coursesWithoutPlo > 0 ? "warn" : "ok", icon: "plo" },
      { label: "Weight exceptions awaiting decision", value: pendingWeightExceptions, href: "/omc/weight-exceptions", tone: pendingWeightExceptions > 0 ? "warn" : "ok", icon: "weights" },
      { label: "Total courses in scope", value: totalCourses, tone: "neutral", icon: "courses" },
    ],
    progress: [
      { label: "PLO mapping coverage", done: totalCourses - coursesWithoutPlo, total: totalCourses, hint: "courses mapped to at least one PLO" },
    ],
    breakdown: {
      title: "Course templates by status",
      subtitle: "Subject Expert templates across your institution",
      items: byTemplateStatus.map((g) => ({ label: statusLabel(g.templateStatus), value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}

async function subjectExpertOverview(subjectExpertId: string): Promise<Overview> {
  const courses = await prisma.course.findMany({
    where: { subjectExpertId },
    select: { templateStatus: true, _count: { select: { clos: { where: { source: "SE" } }, lectureRows: { where: { source: "SE" } } } } },
  });
  const noClos = courses.filter((c) => c._count.clos === 0).length;
  const incompletePlan = courses.filter((c) => c._count.lectureRows < 32).length;
  const byStatus = new Map<string, number>();
  for (const c of courses) byStatus.set(c.templateStatus, (byStatus.get(c.templateStatus) || 0) + 1);

  return {
    stats: [
      { label: "Courses with no CLOs yet", value: noClos, href: "/subjectexpert/courses", tone: noClos > 0 ? "warn" : "ok", icon: "clo" },
      { label: "Courses with an incomplete lecture plan", value: incompletePlan, href: "/subjectexpert/courses", tone: incompletePlan > 0 ? "warn" : "ok", icon: "semester" },
      { label: "Total courses assigned to you", value: courses.length, tone: "neutral", icon: "courses" },
    ],
    progress: [
      { label: "CLOs defined", done: courses.length - noClos, total: courses.length, hint: "courses have CLOs" },
      { label: "Lecture plans complete", done: courses.length - incompletePlan, total: courses.length, hint: "courses have a full lecture plan" },
    ],
    breakdown: {
      title: "Your templates by status",
      subtitle: "Where each of your course templates stands",
      items: Array.from(byStatus, ([status, value]) => ({ label: statusLabel(status), value })).sort((a, b) => b.value - a.value),
    },
  };
}

async function instructorOverview(instructorId: string): Promise<Overview> {
  const courses = await prisma.course.findMany({
    where: { instructorId, isOffered: true },
    select: { id: true, code: true, title: true, _count: { select: { studentEnrollments: true } } },
  });
  const ids = courses.map((c) => c.id);
  // Two grouped queries instead of two count queries per course.
  const [marks, instruments] = ids.length
    ? await Promise.all([
        prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }),
        prisma.assessmentInstrument.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR" }, _count: { _all: true } }),
      ])
    : [[], []];
  const marksBy = new Map(marks.map((m) => [m.courseId, m._count._all]));
  const instrumentsBy = new Map(instruments.map((m) => [m.courseId, m._count._all]));

  let coursesWithMissingMarks = 0;
  for (const c of courses) {
    const enrolled = c._count.studentEnrollments;
    const instrumentCount = instrumentsBy.get(c.id) || 0;
    const marksCount = marksBy.get(c.id) || 0;
    if (enrolled > 0 && instrumentCount > 0 && marksCount < enrolled * instrumentCount) coursesWithMissingMarks++;
  }

  return {
    stats: [
      { label: "Offered courses with incomplete marks", value: coursesWithMissingMarks, href: "/instructor/courses", tone: coursesWithMissingMarks > 0 ? "warn" : "ok", icon: "marks" },
      { label: "Offered courses this semester", value: courses.length, href: "/instructor/courses", tone: "neutral", icon: "semester" },
    ],
    progress: [
      { label: "Marks entry complete", done: courses.length - coursesWithMissingMarks, total: courses.length, hint: "offered courses have complete marks" },
    ],
    breakdown: {
      title: "Enrolled students per course",
      subtitle: "Your offered courses this semester",
      items: courses.map((c) => ({ label: `${c.code} — ${c.title}`, value: c._count.studentEnrollments })).sort((a, b) => b.value - a.value).slice(0, 8),
    },
  };
}

async function chairmanOverview(chairmanId: string): Promise<Overview> {
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const [plosByStatus, openCqi, batches] = await Promise.all([
    prisma.pLO.groupBy({ by: ["status"], where: { batch: { coordinatorId: { in: coordinatorIds } } }, _count: { _all: true } }),
    prisma.cqiRecord.count({ where: { chairmanId, status: { in: ["open", "in-progress"] } } }),
    prisma.batch.count({ where: { coordinatorId: { in: coordinatorIds } } }),
  ]);
  const totalPlos = plosByStatus.reduce((sum, g) => sum + g._count._all, 0);
  const pendingPlos = plosByStatus.filter((g) => g.status !== "approved").reduce((sum, g) => sum + g._count._all, 0);

  return {
    stats: [
      { label: "PLOs awaiting your approval", value: pendingPlos, href: "/chairman/plos", tone: pendingPlos > 0 ? "warn" : "ok", icon: "plo" },
      { label: "Open CQI findings", value: openCqi, href: "/chairman/cqi", tone: openCqi > 0 ? "warn" : "ok", icon: "cqi" },
      { label: "Program Coordinators", value: coordinators.length, href: "/chairman/coordinators", tone: "neutral", icon: "coordinators" },
      { label: "Batches across your institution", value: batches, tone: "neutral", icon: "batches" },
    ],
    progress: [
      { label: "PLOs approved", done: totalPlos - pendingPlos, total: totalPlos, hint: "PLOs approved" },
    ],
    breakdown: {
      title: "PLOs by status",
      subtitle: "Across every batch in your institution",
      items: plosByStatus.map((g) => ({ label: statusLabel(g.status), value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}

async function courseAssignerOverview(user: { id: string; managedById: string | null }): Promise<Overview> {
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true, name: true } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const [unassigned, offeredByCoordinator] = await Promise.all([
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: null } }),
    prisma.course.groupBy({ by: ["coordinatorId"], where: { coordinatorId: { in: coordinatorIds }, isOffered: true }, _count: { _all: true } }),
  ]);
  const totalOffered = offeredByCoordinator.reduce((sum, g) => sum + g._count._all, 0);
  const coordinatorName = new Map(coordinators.map((c) => [c.id, c.name]));

  return {
    stats: [
      { label: "Offered courses with no Primary Instructor", value: unassigned, href: "/assigner/matrix", tone: unassigned > 0 ? "warn" : "ok", icon: "assign" },
      { label: "Total offered courses", value: totalOffered, tone: "neutral", icon: "courses" },
    ],
    progress: [
      { label: "Primary Instructors assigned", done: totalOffered - unassigned, total: totalOffered, hint: "offered courses have a Primary Instructor" },
    ],
    breakdown: {
      title: "Offered courses by program",
      subtitle: "Grouped by Program Coordinator",
      items: offeredByCoordinator.map((g) => ({ label: coordinatorName.get(g.coordinatorId) || "Coordinator", value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}

async function superUserOverview(): Promise<Overview> {
  const [requestsByStatus, chairmen] = await Promise.all([
    prisma.accountRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count({ where: { role: "CHAIRMAN" } }),
  ]);
  const pendingRequests = requestsByStatus.find((g) => g.status === "PENDING")?._count._all || 0;

  return {
    stats: [
      { label: "Pending account requests", value: pendingRequests, href: "/admin/account-requests", tone: pendingRequests > 0 ? "warn" : "ok", icon: "requests" },
      { label: "Institutions (Chairmen)", value: chairmen, href: "/admin/users", tone: "neutral", icon: "institution" },
    ],
    progress: [],
    breakdown: {
      title: "Account requests by status",
      subtitle: "All institution sign-up requests",
      items: requestsByStatus.map((g) => ({ label: statusLabel(g.status), value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}
