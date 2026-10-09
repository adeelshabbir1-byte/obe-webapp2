import { prisma } from "./db";
import { hatsOf } from "./dualRoles";

export const DEADLINE_KINDS: Record<string, string> = {
  CUSTOM: "Any task", PLO_MAP: "Course mapped to PLOs", CLO_PLO: "CLOs mapped to PLOs", CLO_SET: "CLOs written", LECTURE_PLAN: "Lecture plan built and mapped to CLOs", ASSESSMENT_PLAN: "Quizzes / assignments / exams set up",
  PAPERS: "Midterm and final paper distribution set", SUBMITTED: "Course submitted to OMC", MARKS: "Marks entered", ATTENDANCE: "Attendance recorded",
};
export const COURSE_KINDS = Object.keys(DEADLINE_KINDS).filter((k) => k !== "CUSTOM");
export const ROLE_LABEL: Record<string, string> = {
  DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead",
  SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager",
};
/** The role a piece of course work belongs to. null = the setter chooses (papers) or it is a free task. */
export const KIND_ROLE: Record<string, string | null> = {
  CUSTOM: null, PLO_MAP: "PROGRAM_COORDINATOR", CLO_PLO: "SUBJECT_EXPERT", CLO_SET: "SUBJECT_EXPERT", LECTURE_PLAN: "SUBJECT_EXPERT", ASSESSMENT_PLAN: "SUBJECT_EXPERT", SUBMITTED: "SUBJECT_EXPERT",
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
    case "PLO_MAP": return (await prisma.coursePloMapping.count({ where: { courseId } })) > 0;
    case "CLO_PLO": {
      const clos = (await prisma.cLO.findMany({ where: { courseId, source: "SE" }, select: { mappedPloId: true } })) as unknown as { mappedPloId: string | null }[];
      return clos.length > 0 && clos.every((c) => !!c.mappedPloId);
    }
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

/**
 * A standing deadline ("allCourses") applies to every course in the setter's area, including courses added later.
 * The template row is never shown; each course gets its own row so it can be tracked and completed on its own.
 */
export async function topUpStanding(chairmanId: string) {
  const templates = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: true } as never })) as unknown as { id: string; planTerm: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; dueDate: Date }[];
  for (const t of templates) {
    const setter = await prisma.user.findUnique({ where: { id: t.setById }, select: { id: true, role: true, managedById: true, facultyId: true, departmentId: true } });
    if (!setter || !SETTER_ROLES.includes(setter.role)) continue;
    const { leadIds } = await reach(setter);
    if (!leadIds.length) continue;
    const courses = await prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true }, take: 1500 });
    const have = new Set((await prisma.deadline.findMany({ where: { chairmanId, setById: t.setById, kind: t.kind, title: t.title, dueDate: t.dueDate, courseId: { not: null } }, select: { courseId: true } })).map((x) => x.courseId as string));
    const missing = courses.filter((c) => !have.has(c.id));
    if (missing.length) await prisma.deadline.createMany({ data: missing.map((c) => ({ chairmanId, assigneeId: null, role: t.role, setById: t.setById, kind: t.kind, title: t.title, description: t.description, courseId: c.id, dueDate: t.dueDate, planTerm: t.planTerm })) as never });
  }
}

/** The usual order of work in a semester, with suggested days from the semester start (negative = before it starts). */
export const PLAN_TEMPLATE: { key: string; kind: string; title: string; role: string; offset: number; why: string }[] = [
  { key: "PLO_MAP", kind: "PLO_MAP", title: "Course-to-PLO mapping complete", role: "PROGRAM_COORDINATOR", offset: -45, why: "Every course is mapped to the PLOs it serves" },
  { key: "CLO_SET", kind: "CLO_SET", title: "CLOs written for every course", role: "SUBJECT_EXPERT", offset: -40, why: "Subject Experts write the course learning outcomes" },
  { key: "CLO_PLO", kind: "CLO_PLO", title: "Every CLO mapped to a PLO", role: "SUBJECT_EXPERT", offset: -35, why: "Each CLO says which PLO it supports" },
  { key: "LECTURE_PLAN", kind: "LECTURE_PLAN", title: "Lecture plan built and mapped to CLOs", role: "SUBJECT_EXPERT", offset: -28, why: "Every lecture topic is tied to a CLO" },
  { key: "ASSESSMENT_PLAN", kind: "ASSESSMENT_PLAN", title: "Quizzes, assignments and exams planned", role: "SUBJECT_EXPERT", offset: -21, why: "How many and on which topics" },
  { key: "PAPERS", kind: "PAPERS", title: "Midterm and final paper distribution set", role: "SUBJECT_EXPERT", offset: -14, why: "Marks per CLO in each paper" },
  { key: "SUBMITTED", kind: "SUBMITTED", title: "Course submitted to the OMC", role: "SUBJECT_EXPERT", offset: -10, why: "The course sheet goes for review" },
  { key: "ATTENDANCE", kind: "ATTENDANCE", title: "Attendance being recorded", role: "INSTRUCTOR", offset: 21, why: "Attendance for the first weeks is in" },
  { key: "MARKS", kind: "MARKS", title: "Marks entered", role: "INSTRUCTOR", offset: 119, why: "All marks are in so reports can be produced" },
];
export const RANK: Record<string, number> = { CHAIRMAN: 0, DEAN: 1, HEAD_OF_DEPARTMENT: 2, DEPARTMENT_COORDINATOR: 3, PROGRAM_COORDINATOR: 4 };

/** Stamp the first time we see that the work behind a course deadline has been done. */
export async function stampDone(rows: { id: string; kind: string; courseId: string | null; role: string | null; completedAt: Date | null }[], limit = 150) {
  let n = 0;
  for (const d of rows) {
    if (d.completedAt || !d.courseId) continue;
    if (n++ >= limit) break;
    if (await detectDone(d.kind, d.courseId, d.role || KIND_ROLE[d.kind])) {
      d.completedAt = new Date();
      await prisma.deadline.update({ where: { id: d.id }, data: { completedAt: d.completedAt } });
    }
  }
}

export type PlanState = "BEHIND" | "AT_RISK" | "ON_TRACK" | "COMPLETE";
export type PlanLine = {
  id: string; title: string; kind: string; role: string | null; planTerm: string | null; dueDate: Date; setBy: string; setById: string; mine: boolean;
  total: number; done: number; late: number; behind: number; state: PlanState; daysLeft: number;
  notDone: { courseId: string; label: string; who: string }[];
  passed: { by: string; dueDate: Date; slack: number }[];
};

/** How far every standing target in the user's area has got. Highlights what is behind. */
export async function planProgress(user: U, opts: { stamp?: boolean } = {}): Promise<PlanLine[]> {
  const chairmanId = chairmanOf(user);
  await topUpStanding(chairmanId);
  const { leadIds } = await reach(user);
  const templates = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: true } as never, orderBy: { dueDate: "asc" } })) as unknown as { id: string; parentId: string | null; planTerm: string | null; role: string | null; setById: string; kind: string; title: string; dueDate: Date }[];
  const setters = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(templates.map((t) => t.setById))) } }, select: { id: true, name: true, role: true } })).map((u) => [u.id as string, u as { id: string; name: string; role: string }]));
  const myRank = RANK[user.role] ?? 9;
  const visible = templates.filter((t) => t.setById === user.id || (RANK[setters.get(t.setById)?.role || ""] ?? 9) < myRank || user.role === "CHAIRMAN");
  const courses = leadIds.length ? await prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true }, take: 1500 }) : [];
  const courseIds = courses.map((c) => c.id);
  const cMap = new Map(courses.map((c) => [c.id, c]));
  const now = new Date();
  const lines: PlanLine[] = [];
  for (const t of visible) {
    const rows = (await prisma.deadline.findMany({ where: { chairmanId, setById: t.setById, kind: t.kind, title: t.title, dueDate: t.dueDate, courseId: { in: courseIds.length ? courseIds : ["none"] }, allCourses: false } as never, select: { id: true, kind: true, courseId: true, role: true, completedAt: true } })) as unknown as { id: string; kind: string; courseId: string | null; role: string | null; completedAt: Date | null }[];
    if (opts.stamp !== false) await stampDone(rows, 120);
    const end = new Date(t.dueDate.getTime() + 86400000 - 1);
    const done = rows.filter((r) => r.completedAt).length;
    const late = rows.filter((r) => r.completedAt && r.completedAt > end).length;
    const open = rows.filter((r) => !r.completedAt);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
    const behind = now > end ? open.length : 0;
    let state: PlanState = rows.length && done === rows.length ? "COMPLETE" : behind > 0 ? "BEHIND" : daysLeft <= 14 && rows.length > 0 && done / rows.length < 0.5 ? "AT_RISK" : "ON_TRACK";
    const role = t.role || KIND_ROLE[t.kind];
    const notDone = open.slice(0, 40).map((r) => {
      const c = cMap.get(r.courseId as string);
      const who = role === "INSTRUCTOR" ? c?.instructorId : role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.subjectExpertId;
      return { courseId: r.courseId as string, label: c ? `${c.code} ${c.title}` : "—", who: who || "" };
    });
    const kids = templates.filter((k) => k.parentId === t.id);
    lines.push({
      id: t.id, title: t.title, kind: t.kind, role, planTerm: t.planTerm, dueDate: t.dueDate, setBy: setters.get(t.setById)?.name || "—", setById: t.setById, mine: t.setById === user.id,
      total: rows.length, done, late, behind, state, daysLeft, notDone,
      passed: kids.map((k) => ({ by: setters.get(k.setById)?.name || "—", dueDate: k.dueDate, slack: Math.round((t.dueDate.getTime() - k.dueDate.getTime()) / 86400000) })),
    });
  }
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(lines.flatMap((l) => l.notDone.map((n) => n.who).filter(Boolean)))) } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  for (const l of lines) for (const n of l.notDone) n.who = n.who ? names.get(n.who) || "—" : "";
  return lines;
}
