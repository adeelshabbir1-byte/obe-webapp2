import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { coordinatorIdsFor, chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import OverviewStatGrid, { Stat } from "../../components/OverviewStatGrid";
import Link from "next/link";
import { isDualCapable } from "../../lib/dualRoles";
import AssignmentResponses from "../../components/AssignmentResponses";

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/chairman/coordinators",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  DEAN: "/dean/overview",
  DEPARTMENT_COORDINATOR: "/dept-coordinator/home",
  HEAD_OF_DEPARTMENT: "/hod/department",
  OMC: "/omc/queue",
  INSTRUCTOR: "/instructor/courses",
  LAB_ENGINEER: "/lab-engineer/labs",
  COURSE_ASSIGNER: "/assigner/matrix",
};

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  if (user.role === "SUBJECT_EXPERT" && user.isPlatformExpert) redirect("/master-design");

  // A dual-capable Subject Expert who hasn't picked a role for this session yet.
  if (isDualCapable(user.rawRole, user.secondaryRole, user.assignerHat) && !user.roleChosen) {
    redirect("/choose-role");
  }

  const stats = await statsForRole(user);

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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Overview</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A quick summary of what's done and what still needs your attention. Click any number to go straight
        to it.
      </p>
      <AssignmentResponses items={offered} />
      <OverviewStatGrid stats={stats} />
      <div className="card">
        <Link href={ROLE_HOME[user.role] || "/login"} className="btn btn-brass" style={{ textDecoration: "none" }}>
          Go to {roleLabel(user.role)} workspace →
        </Link>
      </div>
    </Shell>
  );
}

async function statsForRole(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }) {
  switch (user.role) {
    case "PROGRAM_COORDINATOR": return coordinatorStats(user.id);
    case "DEAN": return deanStats(user);
    case "HEAD_OF_DEPARTMENT": return hodStats(user);
    case "OMC": return omcStats(user);
    case "SUBJECT_EXPERT": return subjectExpertStats(user.id);
    case "INSTRUCTOR": return instructorStats(user.id);
    case "CHAIRMAN": return chairmanStats(user.id);
    case "COURSE_ASSIGNER": return courseAssignerStats(user);
    case "SUPER_USER": return superUserStats();
    default: return [];
  }
}

async function coordinatorStats(coordinatorId: string): Promise<Stat[]> {
  const [totalCourses, unassignedSe, batches, unconfirmedPrereqs, totalStudents] = await Promise.all([
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
        OR: [{ contentSyncMember: null }, { contentSyncMember: { isBase: true } }],
      },
    }),
    prisma.batch.findMany({ where: { coordinatorId } }),
    prisma.batch.count({ where: { coordinatorId, prerequisitesConfirmedAt: null } }),
    prisma.student.count({ where: { batch: { coordinatorId } } }),
  ]);
  return [
    { label: "Courses without a Subject Expert", value: unassignedSe, href: "/coordinator/assign-subject-experts", tone: unassignedSe > 0 ? "warn" : "ok" },
    { label: "Batches needing Prerequisite Map review", value: unconfirmedPrereqs, href: "/coordinator/prerequisite-map", tone: unconfirmedPrereqs > 0 ? "warn" : "ok" },
    { label: "Total courses set up", value: totalCourses, href: "/coordinator/courses", tone: "neutral" },
    { label: "Batches", value: batches.length, href: "/coordinator/batches", tone: "neutral" },
    { label: "Students on record", value: totalStudents, href: "/coordinator/students", tone: "neutral" },
  ];
}

async function omcStats(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }): Promise<Stat[]> {
  const coordinatorIds = await coordinatorIdsFor(user);
  const [pendingReview, coursesWithoutPlo, pendingWeightExceptions, totalCourses] = await Promise.all([
    prisma.pendingMasterCourse.count({ where: { masterCurriculum: { chairmanId: await chairmanIdFor(user) } } }),
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds }, ploMappings: { none: {} } } }),
    prisma.weightExceptionRequest.count({ where: { course: { coordinatorId: { in: coordinatorIds } }, status: "pending" } }),
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds } } }),
  ]);
  return [
    { label: "Courses awaiting review", value: pendingReview, href: "/omc/review-pending", tone: pendingReview > 0 ? "warn" : "ok" },
    { label: "Courses with no PLO mapped yet", value: coursesWithoutPlo, href: "/omc/plo-matrix", tone: coursesWithoutPlo > 0 ? "warn" : "ok" },
    { label: "Weight exceptions awaiting decision", value: pendingWeightExceptions, href: "/omc/weight-exceptions", tone: pendingWeightExceptions > 0 ? "warn" : "ok" },
    { label: "Total courses in scope", value: totalCourses, tone: "neutral" },
  ];
}

async function subjectExpertStats(subjectExpertId: string): Promise<Stat[]> {
  const courses = await prisma.course.findMany({
    where: { subjectExpertId },
    include: { _count: { select: { clos: { where: { source: "SE" } }, lectureRows: { where: { source: "SE" } } } } },
  });
  const noClos = courses.filter((c) => c._count.clos === 0).length;
  const incompletePlan = courses.filter((c) => c._count.lectureRows < 32).length;
  return [
    { label: "Courses with no CLOs yet", value: noClos, href: "/subjectexpert/courses", tone: noClos > 0 ? "warn" : "ok" },
    { label: "Courses with an incomplete lecture plan", value: incompletePlan, href: "/subjectexpert/courses", tone: incompletePlan > 0 ? "warn" : "ok" },
    { label: "Total courses assigned to you", value: courses.length, tone: "neutral" },
  ];
}

async function instructorStats(instructorId: string): Promise<Stat[]> {
  const courses = await prisma.course.findMany({ where: { instructorId, isOffered: true }, include: { studentEnrollments: true } });
  let coursesWithMissingMarks = 0;
  for (const c of courses) {
    const marksCount = await prisma.studentMark.count({ where: { courseId: c.id } });
    const instrumentCount = await prisma.assessmentInstrument.count({ where: { courseId: c.id, source: "INSTRUCTOR" } });
    if (c.studentEnrollments.length > 0 && instrumentCount > 0 && marksCount < c.studentEnrollments.length * instrumentCount) coursesWithMissingMarks++;
  }
  return [
    { label: "Offered courses with incomplete marks", value: coursesWithMissingMarks, href: "/instructor/courses", tone: coursesWithMissingMarks > 0 ? "warn" : "ok" },
    { label: "Offered courses this semester", value: courses.length, href: "/instructor/courses", tone: "neutral" },
  ];
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
    { label: "PLOs awaiting your approval", value: pendingPlos, href: "/chairman/plos", tone: pendingPlos > 0 ? "warn" : "ok" },
    { label: "Open CQI findings", value: openCqi, href: "/chairman/cqi", tone: openCqi > 0 ? "warn" : "ok" },
    { label: "Program Coordinators", value: coordinators.length, href: "/chairman/coordinators", tone: "neutral" },
    { label: "Batches across your institution", value: batches, tone: "neutral" },
  ];
}

async function courseAssignerStats(user: { id: string; managedById: string | null }): Promise<Stat[]> {
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const [unassigned, totalOffered] = await Promise.all([
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: null } }),
    prisma.course.count({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true } }),
  ]);
  return [
    { label: "Offered courses with no Primary Instructor", value: unassigned, href: "/assigner/primary-instructors", tone: unassigned > 0 ? "warn" : "ok" },
    { label: "Total offered courses", value: totalOffered, tone: "neutral" },
  ];
}

async function superUserStats(): Promise<Stat[]> {
  const [pendingRequests, chairmen] = await Promise.all([
    prisma.accountRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: "CHAIRMAN" } }),
  ]);
  return [
    { label: "Pending account requests", value: pendingRequests, href: "/admin/account-requests", tone: pendingRequests > 0 ? "warn" : "ok" },
    { label: "Institutions (Institute Heads)", value: chairmen, href: "/admin/users", tone: "neutral" },
  ];
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
    { label: "Teacher requests waiting for you", value: waiting, href: "/dean/approvals", tone: waiting > 0 ? "warn" : "ok" },
    { label: "Departments in your faculty", value: departments, href: "/dean/overview", tone: "neutral" },
    { label: "Teachers in your faculty", value: staff, href: "/dean/overview", tone: "neutral" },
    { label: "Offered courses with no teacher yet", value: noTeacher, href: "/dean/overview", tone: noTeacher > 0 ? "warn" : "ok" },
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
    { label: "Teacher loan requests to answer", value: loanRequests, href: "/hod/department", tone: loanRequests > 0 ? "warn" : "ok" },
    { label: "Teacher assignments awaiting your approval", value: pendingApprovals, href: "/hod/department", tone: pendingApprovals > 0 ? "warn" : "ok" },
    { label: "Programs in your department", value: programs, href: "/hod/department", tone: "neutral" },
    { label: "Teachers in your department", value: staff, href: "/hod/department", tone: "neutral" },
    { label: "Offered courses with no teacher yet", value: noTeacher, href: "/hod/department", tone: noTeacher > 0 ? "warn" : "ok" },
  ];
}
