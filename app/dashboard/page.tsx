import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { coordinatorIdsFor, chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import OverviewStatGrid, { Stat } from "../../components/OverviewStatGrid";
import Link from "next/link";

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/chairman/coordinators",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  OMC: "/omc/queue",
  INSTRUCTOR: "/instructor/courses",
  COURSE_ASSIGNER: "/assigner/matrix",
};

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  // A dual-capable Subject Expert who hasn't picked a role for this session yet.
  if (user.rawRole === "SUBJECT_EXPERT" && user.secondaryRole === "INSTRUCTOR" && !user.roleChosen) {
    redirect("/choose-role");
  }

  const stats = await statsForRole(user);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Overview</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A quick summary of what's done and what still needs your attention. Click any number to go straight
        to it.
      </p>
      <OverviewStatGrid stats={stats} />
      <div className="card">
        <Link href={ROLE_HOME[user.role] || "/login"} className="btn btn-brass" style={{ textDecoration: "none" }}>
          Go to {roleLabel(user.role)} workspace →
        </Link>
      </div>
    </Shell>
  );
}

async function statsForRole(user: { id: string; role: string; managedById: string | null }) {
  switch (user.role) {
    case "PROGRAM_COORDINATOR": return coordinatorStats(user.id);
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
    prisma.course.count({ where: { coordinatorId, subjectExpertId: null } }),
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

async function omcStats(user: { id: string; role: string; managedById: string | null }): Promise<Stat[]> {
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
    { label: "Institutions (Chairmen)", value: chairmen, href: "/admin/users", tone: "neutral" },
  ];
}
