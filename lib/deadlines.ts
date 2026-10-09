import { prisma } from "./db";
import { hatsOf } from "./dualRoles";

export const DEADLINE_KINDS: Record<string, string> = {
  CUSTOM: "Any task", CLO_SET: "CLOs written", LECTURE_PLAN: "Lecture plan built and mapped to CLOs", ASSESSMENT_PLAN: "Quizzes / assignments / exams set up",
  PAPERS: "Midterm and final paper distribution set", SUBMITTED: "Course submitted to OMC", MARKS: "Marks entered", ATTENDANCE: "Attendance recorded",
};
export const COURSE_KINDS = Object.keys(DEADLINE_KINDS).filter((k) => k !== "CUSTOM");
export const ROLE_LABEL: Record<string, string> = {
  DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead",
  SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager",
};
/** The role a piece of course work belongs to. null = the setter chooses (papers) or it is a free task. */
export const KIND_ROLE: Record<string, string | null> = {
  CUSTOM: null, CLO_SET: "SUBJECT_EXPERT", LECTURE_PLAN: "SUBJECT_EXPERT", ASSESSMENT_PLAN: "SUBJECT_EXPERT", SUBMITTED: "SUBJECT_EXPERT",
  PAPERS: null, MARKS: "INSTRUCTOR", ATTENDANCE: "INSTRUCTOR",
};
export const SETTER_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const PEOPLE_ROLES = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER"];

type U = { id: string; role: string; managedById: string | null; facultyId?: string | null; departmentId?: string | null };

export function chairmanOf(u: U) { return u.role === "CHAIRMAN" ? u.id : u.managedById || "none"; }

/** The people this user may set deadlines for, and the Program Leads whose courses are in reach. */
export async function reach(user: U) {
  const chairmanId = chairmanOf(user);
  let leadIds: string[] = [];
  let where: Record<string, unknown>;
  if (user.role === "PROGRAM_COORDINATOR") {
    leadIds = [user.id];
    where = { managedById: user.id };
  } else {
    let deptIds: string[] | null = null;
    if (user.role === "DEAN") deptIds = (await prisma.department.findMany({ where: { chairmanId, facultyId: user.facultyId || "none" }, select: { id: true } })).map((d) => d.id);
    else if (user.role === "HEAD_OF_DEPARTMENT" || user.role === "DEPARTMENT_COORDINATOR") deptIds = user.departmentId ? [user.departmentId] : [];
    const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, ...(deptIds ? { departmentId: { in: deptIds } } : {}) }, select: { id: true } });
    leadIds = leads.map((l) => l.id);
    where = deptIds === null
      ? { OR: [{ managedById: chairmanId }, { managedById: { in: leadIds } }] }
      : { OR: [{ departmentId: { in: deptIds } }, { managedById: { in: leadIds } }] };
  }
  const peopleRaw = (await prisma.user.findMany({
    where: { ...where, id: { not: user.id }, isActive: true, isVisitingPlaceholder: false, role: { in: PEOPLE_ROLES as never } } as never,
    select: { id: true, name: true, role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true },
    orderBy: { name: "asc" },
  })) as unknown as { id: string; name: string; role: string; secondaryRole: string | null; tertiaryRole: string | null; extraRoles: string[] }[];
  const people = peopleRaw.map((p) => ({ id: p.id, name: p.name, role: p.role, hats: hatsOf({ rawRole: p.role, secondaryRole: p.secondaryRole, tertiaryRole: p.tertiaryRole, extraRoles: p.extraRoles }) }));
  return { chairmanId, leadIds, people };
}

/** Has the thing the deadline asks for actually been done? Course-linked kinds are detected from the data. */
export async function detectDone(kind: string, courseId: string, role: string | null): Promise<boolean> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { templateStatus: true } });
  if (!course) return false;
  const source = role === "INSTRUCTOR" ? "INSTRUCTOR" : "SE";
  switch (kind) {
    case "CLO_SET": return (await prisma.cLO.count({ where: { courseId, source: "SE" } })) > 0;
    case "LECTURE_PLAN": {
      const [all, mapped] = await Promise.all([prisma.lectureRow.count({ where: { courseId, source: "SE" } }), prisma.lectureRow.count({ where: { courseId, source: "SE", cloId: { not: null } } })]);
      return all > 0 && all === mapped;
    }
    case "ASSESSMENT_PLAN": return (await prisma.assessmentInstrument.count({ where: { courseId, source: "SE" } })) > 0;
    case "PAPERS": {
      const [m, f] = await Promise.all([prisma.paperDistributionItem.count({ where: { courseId, source, examType: "Midterm" } }), prisma.paperDistributionItem.count({ where: { courseId, source, examType: "Final" } })]);
      return m > 0 && f > 0;
    }
    case "SUBMITTED": return course.templateStatus !== "draft" && course.templateStatus !== "changes-requested";
    case "MARKS": return (await prisma.studentMark.count({ where: { courseId } })) > 0;
    case "ATTENDANCE": return (await prisma.attendanceRecord.count({ where: { courseId } })) > 0;
    default: return false;
  }
}

export type DlStatus = "ON_TIME" | "LATE_DONE" | "OVERDUE" | "SOON" | "UPCOMING";
export function statusOf(d: { dueDate: Date; completedAt: Date | null }, now = new Date()): DlStatus {
  const endOfDue = new Date(d.dueDate.getTime() + 86400000 - 1); // due at the end of that day
  if (d.completedAt) return d.completedAt <= endOfDue ? "ON_TIME" : "LATE_DONE";
  if (now > endOfDue) return "OVERDUE";
  return endOfDue.getTime() - now.getTime() <= 3 * 86400000 ? "SOON" : "UPCOMING";
}
export const STATUS_TEXT: Record<DlStatus, string> = { ON_TIME: "Done on time", LATE_DONE: "Done late", OVERDUE: "Overdue", SOON: "Due soon", UPCOMING: "Upcoming" };
export const STATUS_COLOUR: Record<DlStatus, string> = { ON_TIME: "#2E7D4F", LATE_DONE: "#B7791F", OVERDUE: "#B3261E", SOON: "#1B6CA8", UPCOMING: "#6B7177" };
