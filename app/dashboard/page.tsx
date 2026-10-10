import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { coordinatorIdsFor, chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import OverviewStatGrid, { Stat } from "../../components/OverviewStatGrid";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheckBig, ShieldCheck } from "lucide-react";
import { isDualCapable } from "../../lib/dualRoles";
import AssignmentResponses from "../../components/AssignmentResponses";
import { greetingName } from "../../lib/names";
import { BRAND, sized } from "../../lib/brandAssets";

export const metadata = { title: "Overview" };

// Extra panels under the numbers: how complete each area is, and one breakdown of the role's own data.
type Progress = { label: string; done: number; total: number; hint: string };
type Breakdown = { title: string; subtitle: string; items: { label: string; value: number }[] } | null;
type Overview = { stats: Stat[]; progress?: Progress[]; breakdown?: Breakdown };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes requested",
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected",
};
const statusLabel = (s: string) => STATUS_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1);

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/home",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  DEAN: "/dean/overview",
  DEPARTMENT_COORDINATOR: "/dept-coordinator/home",
  HEAD_OF_DEPARTMENT: "/hod/department",
  OMC: "/omc/queue",
  INSTRUCTOR: "/instructor/courses",
  LAB_ENGINEER: "/lab-engineer/labs",
  LAB_MANAGER: "/lab-inventory",
  LIBRARIAN: "/library-inventory",
  FINANCE_OFFICER: "/chairman/finance",
  STUDENT_AFFAIRS: "/admission-criteria",
  COURSE_ASSIGNER: "/assigner/matrix",
};

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  if (user.role === "SUBJECT_EXPERT" && user.isPlatformExpert) redirect("/master-design");

  // A dual-capable Subject Expert who hasn't picked a role for this session yet.
  if (isDualCapable(user.rawRole, user.secondaryRole, user.assignerHat || user.omcHat) && !user.roleChosen) {
    redirect("/choose-role");
  }

  if (user.role === "CHAIRMAN") redirect("/home");
  const { stats, progress = [], breakdown = null } = await statsForRole(user);
  const attention = stats.filter((s) => s.tone === "warn" && s.value > 0).length;
  const breakdownMax = Math.max(1, ...(breakdown?.items.map((i) => i.value) || [1]));

  // Courses another department has given this person, waiting for their yes/no.
  let offered: { courseId: string; as: "INSTRUCTOR" | "SUBJECT_EXPERT"; course: string; batch: string; from: string }[] = [];
  if (user.role === "INSTRUCTOR" || user.role === "SUBJECT_EXPERT") {
    const asSe = user.role === "SUBJECT_EXPERT";
    const rows = await prisma.course.findMany({
      where: asSe ? { subjectExpertId: user.id, seResponse: "PENDING" } : { instructorId: user.id, instructorResponse: "PENDING" },
      select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } }, coordinator: { select: { department_: { select: { name: true } } } } },
    });
    offered = rows.map((c) => ({ courseId: c.id, as: asSe ? "SUBJECT_EXPERT" : "INSTRUCTOR", course: `${c.code} — ${c.title}`, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", from: c.coordinator.department_?.name || "—" }));
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <section className="hero">
        <div className="hero-row">
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <h1>Welcome back, {greetingName(user.name)}</h1>
            <p>A quick summary of what&apos;s done and what still needs your attention. Click any number to go straight to it.</p>
            <div className="hero-chips">
              <span className="hero-chip"><ShieldCheck size={14} /> {roleLabel(user.role)}</span>
              {stats.length > 0 && (
                <span className="hero-chip">
                  {attention > 0 ? <CircleAlert size={14} /> : <CircleCheckBig size={14} />}
                  {attention > 0 ? `${attention} area${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} attention` : "Everything is on track"}
                </span>
              )}
            </div>
            <div style={{ marginTop: 18 }}>
              <Link href={ROLE_HOME[user.role] || "/login"} className="btn">
                Go to {roleLabel(user.role)} workspace <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <img className="hero-mark" src={BRAND.mark.src} alt="" {...sized(BRAND.mark, 104)} />
        </div>
      </section>

      <AssignmentResponses items={offered} />
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
                breakdown.items.map((item) => (
                  <div className="progress-item" key={item.label}>
                    <div className="progress-head">
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.label}>{item.label}</span>
                      <span>{item.value.toLocaleString()}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${item.value > 0 ? Math.max(2, (item.value / breakdownMax) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))
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
              {progress.map((p) => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <div className="progress-item" key={p.label}>
                    <div className="progress-head">
                      <span>{p.label}</span>
                      <span>{p.total > 0 ? `${pct}%` : "—"}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%`, ["--c" as string]: "var(--sage)" } as React.CSSProperties} />
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

async function statsForRole(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }): Promise<Overview> {
  switch (user.role) {
    case "PROGRAM_COORDINATOR": return coordinatorStats(user.id);
    case "DEAN": return { stats: await deanStats(user) };
    case "HEAD_OF_DEPARTMENT": return { stats: await hodStats(user) };
    case "OMC": return omcStats(user);
    case "SUBJECT_EXPERT": return subjectExpertStats(user.id);
    case "INSTRUCTOR": return instructorStats(user.id);
    case "CHAIRMAN": return { stats: await chairmanStats(user.id) };
    case "COURSE_ASSIGNER": return courseAssignerStats(user);
    case "SUPER_USER": return superUserStats();
    default: return { stats: [] };
  }
}

async function coordinatorStats(coordinatorId: string): Promise<Overview> {
  // Only a standalone course, or the base of its content-sync group, can take a direct Subject Expert assignment.
  const assignable = { OR: [{ contentSyncMember: null }, { contentSyncMember: { isBase: true } }] };
  const [totalCourses, unassignedSe, batches, unconfirmedPrereqs, studentsByBatch, assignableCourses] = await Promise.all([
    prisma.course.count({ where: { coordinatorId } }),
    // A course linked as a non-base follower in a content-sync group never
    // carries its own subjectExpertId directly — it inherits its base's
    // assignment (the Assign Subject Experts page hides these rows for
    // exactly that reason). Counting them here as "unassigned" was
    // reporting hundreds of courses as missing an SE that were actually
    // fully covered by their base's assignment; only count a course that
    // could actually take a direct assignment (standalone, or the base
    // of its group) and doesn't have one.
    prisma.course.count({
      where: {
        coordinatorId,
        subjectExpertId: null,
        ...assignable,
      },
    }),
    prisma.batch.findMany({ where: { coordinatorId }, select: { id: true, degreeProgram: true, batchName: true } }),
    prisma.batch.count({ where: { coordinatorId, prerequisitesConfirmedAt: null } }),
    prisma.student.groupBy({ by: ["batchId"], where: { batch: { coordinatorId } }, _count: { _all: true } }),
    prisma.course.count({ where: { coordinatorId, ...assignable } }),
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
      { label: "Subject Expert assignment", done: assignableCourses - unassignedSe, total: assignableCourses, hint: "courses that need one have a Subject Expert" },
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

async function omcStats(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }): Promise<Overview> {
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
      // /omc/review-pending never existed; the pending master courses are reviewed on the Master Curriculum page.
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

async function subjectExpertStats(subjectExpertId: string): Promise<Overview> {
  const all = await prisma.course.findMany({
    where: { subjectExpertId },
    include: { contentSyncMember: { select: { isBase: true } }, _count: { select: { clos: { where: { source: "SE" } }, lectureRows: { where: { source: "SE" } } } } },
  });
  // A follower course copies its content from its base course, so there is nothing to do on it. Only base and standalone courses are work.
  const courses = all.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase);
  const followers = all.length - courses.length;
  const noClos = courses.filter((c) => c._count.clos === 0).length;
  const incompletePlan = courses.filter((c) => c._count.lectureRows < 32).length;
  const byStatus = new Map<string, number>();
  for (const c of courses) byStatus.set(c.templateStatus, (byStatus.get(c.templateStatus) || 0) + 1);
  return {
    stats: [
      { label: "Courses with no CLOs yet", value: noClos, href: "/subjectexpert/courses", tone: noClos > 0 ? "warn" : "ok", icon: "clo" },
      { label: "Courses with an incomplete lecture plan", value: incompletePlan, href: "/subjectexpert/courses", tone: incompletePlan > 0 ? "warn" : "ok", icon: "semester" },
      { label: followers > 0 ? `Courses you work on (${followers} more follow them and copy their content)` : "Courses assigned to you", value: courses.length, href: "/subjectexpert/courses", tone: "neutral", icon: "courses" },
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

async function instructorStats(instructorId: string): Promise<Overview> {
  const courses = await prisma.course.findMany({
    where: { instructorId, isOffered: true },
    select: { id: true, code: true, title: true, _count: { select: { studentEnrollments: true } } },
  });
  const ids = courses.map((c) => c.id);
  // Two grouped queries for all courses, instead of two count queries per course.
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

async function chairmanStats(chairmanId: string): Promise<Stat[]> {
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const [pendingPlos, openCqi, batches] = await Promise.all([
    prisma.pLO.count({ where: { batch: { coordinatorId: { in: coordinatorIds } }, status: { not: "approved" } } }),
    prisma.cqiRecord.count({ where: { chairmanId, status: { in: ["open", "in-progress"] } } }),
    prisma.batch.count({ where: { coordinatorId: { in: coordinatorIds } } }),
  ]);
  return [
    { label: "PLOs awaiting your approval", value: pendingPlos, href: "/chairman/plos", tone: pendingPlos > 0 ? "warn" : "ok", icon: "plo" },
    { label: "Open CQI findings", value: openCqi, href: "/chairman/cqi", tone: openCqi > 0 ? "warn" : "ok", icon: "cqi" },
    { label: "Program Leads", value: coordinators.length, href: "/chairman/coordinators", tone: "neutral", icon: "coordinators" },
    { label: "Batches across your institution", value: batches, tone: "neutral", icon: "batches" },
  ];
}

async function courseAssignerStats(user: { id: string; managedById: string | null }): Promise<Overview> {
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
      // /assigner/primary-instructors never existed; Primary Instructor Assignment is the first tab of the matrix page.
      { label: "Offered courses with no Primary Instructor", value: unassigned, href: "/assigner/matrix", tone: unassigned > 0 ? "warn" : "ok", icon: "assign" },
      { label: "Total offered courses", value: totalOffered, tone: "neutral", icon: "courses" },
    ],
    progress: [
      { label: "Primary Instructors assigned", done: totalOffered - unassigned, total: totalOffered, hint: "offered courses have a Primary Instructor" },
    ],
    breakdown: {
      title: "Offered courses by program",
      subtitle: "Grouped by Program Lead",
      items: offeredByCoordinator.map((g) => ({ label: coordinatorName.get(g.coordinatorId) || "Program Lead", value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}

async function superUserStats(): Promise<Overview> {
  const [requestsByStatus, chairmen] = await Promise.all([
    prisma.accountRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count({ where: { role: "CHAIRMAN" } }),
  ]);
  const pendingRequests = requestsByStatus.find((g) => g.status === "PENDING")?._count._all || 0;
  return {
    stats: [
      { label: "Pending account requests", value: pendingRequests, href: "/admin/account-requests", tone: pendingRequests > 0 ? "warn" : "ok", icon: "requests" },
      { label: "Institutions (Institute Heads)", value: chairmen, href: "/admin/users", tone: "neutral", icon: "institution" },
    ],
    breakdown: {
      title: "Account requests by status",
      subtitle: "All institution sign-up requests",
      items: requestsByStatus.map((g) => ({ label: statusLabel(g.status), value: g._count._all })).sort((a, b) => b.value - a.value),
    },
  };
}

async function deanStats(user: { managedById: string | null; facultyId?: string | null }): Promise<Stat[]> {
  const facultyId = user.facultyId || "none";
  const chairmanId = user.managedById || "";
  const [departments, waiting, noTeacher, staff] = await Promise.all([
    prisma.department.count({ where: { facultyId } }),
    prisma.teacherLoanRequest.count({ where: { OR: [{ requesterDeanStatus: "PENDING", requestingDepartment: { facultyId } }, { lenderDeanStatus: "PENDING", lendingDepartment: { facultyId } }] } }),
    prisma.course.count({ where: { isOffered: true, instructorId: null, coordinator: { managedById: chairmanId, department_: { facultyId } } } }),
    prisma.user.count({ where: { department_: { facultyId }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } }),
  ]);
  return [
    { label: "Teacher requests waiting for you", value: waiting, href: "/dean/approvals", tone: waiting > 0 ? "warn" : "ok", icon: "requests" },
    { label: "Departments in your faculty", value: departments, href: "/dean/overview", tone: "neutral", icon: "institution" },
    { label: "Teachers in your faculty", value: staff, href: "/dean/overview", tone: "neutral", icon: "students" },
    { label: "Offered courses with no teacher yet", value: noTeacher, href: "/dean/overview", tone: noTeacher > 0 ? "warn" : "ok", icon: "assign" },
  ];
}

async function hodStats(user: { managedById: string | null; departmentId?: string | null }): Promise<Stat[]> {
  const departmentId = user.departmentId || "none";
  const [loanRequests, pendingApprovals, programs, staff, noTeacher] = await Promise.all([
    prisma.teacherLoanRequest.count({ where: { lendingDepartmentId: departmentId, status: "PENDING", requesterDeanStatus: { not: "PENDING" }, lenderDeanStatus: { not: "PENDING" } } }),
    prisma.course.count({ where: { instructorApproval: "PENDING", coordinator: { managedById: user.managedById || "", departmentId } } }),
    prisma.departmentProgram.count({ where: { departmentId } }),
    prisma.user.count({ where: { departmentId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } }),
    prisma.course.count({ where: { isOffered: true, instructorId: null, coordinator: { managedById: user.managedById || "", departmentId } } }),
  ]);
  return [
    { label: "Teacher loan requests to answer", value: loanRequests, href: "/hod/department", tone: loanRequests > 0 ? "warn" : "ok", icon: "requests" },
    { label: "Teacher assignments awaiting your approval", value: pendingApprovals, href: "/hod/department", tone: pendingApprovals > 0 ? "warn" : "ok", icon: "subjectExpert" },
    { label: "Programs in your department", value: programs, href: "/hod/department", tone: "neutral", icon: "batches" },
    { label: "Teachers in your department", value: staff, href: "/hod/department", tone: "neutral", icon: "students" },
    { label: "Offered courses with no teacher yet", value: noTeacher, href: "/hod/department", tone: noTeacher > 0 ? "warn" : "ok", icon: "assign" },
  ];
}
