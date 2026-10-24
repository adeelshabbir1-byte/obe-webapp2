import { prisma } from "./db";
import { hatsOf } from "./dualRoles";
import { autoTick } from "./planAuto";
import { courseTermIndex, currentTermIndexFor } from "./courseTerm";
import { termIndex } from "./termLogic";
import { seProgressFor } from "./seProgress";

/** "Fall 2026" / "Spring 2027 semester" -> term index; null when the name carries no term. */
export function planTermIndex(planTerm: string | null | undefined): number | null {
  const m = /\b(fall|spring)\b\D*(\d{4})/i.exec(planTerm || "");
  return m ? termIndex(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), parseInt(m[2], 10)) : null;
}

export type WorkCourse = { id: string; code: string; title: string; coordinatorId: string; subjectExpertId: string | null; instructorId: string | null; isOffered: boolean; term: number | null; past: boolean };
/**
 * Courses whose work is still live: offered now, or not offered yet but already given to a Subject Expert for a current
 * or future term (the plan has to be written before the course is offered). Past-term courses are left out.
 */
export async function workCourses(where: Record<string, unknown>): Promise<WorkCourse[]> {
  const raw = await prisma.course.findMany({
    where: { AND: [where, { OR: [{ isOffered: true }, { subjectExpertId: { not: null } }, { instructorId: { not: null } }] }] } as never,
    select: { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true, isOffered: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batch: { select: { startTerm: true, startYear: true } } },
    take: 6000,
  });
  const cur = new Map<string, number | null>();
  for (const id of Array.from(new Set(raw.map((c) => c.coordinatorId)))) cur.set(id, await currentTermIndexFor(id));
  return raw.map((c) => {
    const term = courseTermIndex(c);
    const now = cur.get(c.coordinatorId) ?? null;
    return { id: c.id, code: c.code, title: c.title, coordinatorId: c.coordinatorId, subjectExpertId: c.subjectExpertId, instructorId: c.instructorId, isOffered: c.isOffered, term, past: term !== null && now !== null && term < now };
  }).filter((c) => c.isOffered || !c.past);
}
/** Does a course-work target apply to this course? A plan named for a term covers that term's courses; otherwise offered courses (and, for Subject Expert work, courses already given to an expert). */
export function courseFitsTarget(c: WorkCourse, t: { planTerm: string | null; kind: string; role: string | null }) {
  const idx = planTermIndex(t.planTerm);
  if (idx !== null) return c.term === idx || (c.term === null && c.isOffered);
  const role = t.role || KIND_ROLE[t.kind];
  return c.isOffered || (role === "SUBJECT_EXPERT" && !!c.subjectExpertId && !c.past);
}

export const DEADLINE_KINDS: Record<string, string> = {
  CUSTOM: "Any task", PLO_MAP: "Course mapped to GAs", CLO_PLO: "CLOs mapped to GAs", CLO_SET: "CLOs written", LECTURE_PLAN: "Lecture plan meets the OMC minimum topics per CLO/GA", ASSESSMENT_PLAN: "Quizzes / assignments / exams set up",
  PAPERS: "Midterm and final paper distribution set", SUBMITTED: "Course submitted to OMC", MARKS: "Marks entered", MID_MARKS: "Midterm marks entered", FINAL_MARKS: "Final exam marks entered", ATTENDANCE: "Attendance recorded",
};
export const COURSE_KINDS = Object.keys(DEADLINE_KINDS).filter((k) => k !== "CUSTOM");
export const ROLE_LABEL: Record<string, string> = {
  DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead",
  SUBJECT_EXPERT: "University Subject Expert", INSTRUCTOR: "Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager", LIBRARIAN: "Librarian", FINANCE_OFFICER: "Finance Officer", STUDENT_AFFAIRS: "Student Affairs", FACILITIES_MANAGER: "Facilities Manager",
};
/** The role a piece of course work belongs to. null = the setter chooses (papers) or it is a free task. */
export const KIND_ROLE: Record<string, string | null> = {
  CUSTOM: null, PLO_MAP: "PROGRAM_COORDINATOR", CLO_PLO: "SUBJECT_EXPERT", CLO_SET: "SUBJECT_EXPERT", LECTURE_PLAN: "SUBJECT_EXPERT", ASSESSMENT_PLAN: "SUBJECT_EXPERT", SUBMITTED: "SUBJECT_EXPERT",
  PAPERS: null, MARKS: "INSTRUCTOR", MID_MARKS: "INSTRUCTOR", FINAL_MARKS: "INSTRUCTOR", ATTENDANCE: "INSTRUCTOR",
};
export const SETTER_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const PEOPLE_ROLES = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER"];

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
      const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, courseType: true, coordinatorId: true, templateStatus: true } });
      return !!c && !!(await seProgressFor([c])).get(c.id)?.[1]?.done;
    }
    case "ASSESSMENT_PLAN": return (await prisma.assessmentInstrument.count({ where: { courseId, source: "SE" } })) > 0;
    case "PAPERS": {
      const [m, f] = await Promise.all([prisma.paperDistributionItem.count({ where: { courseId, source, examType: "Midterm" } }), prisma.paperDistributionItem.count({ where: { courseId, source, examType: "Final" } })]);
      return m > 0 && f > 0;
    }
    case "SUBMITTED": return course.templateStatus !== "draft" && course.templateStatus !== "changes-requested" && course.templateStatus !== "reopened";
    case "MARKS": return (await prisma.studentMark.count({ where: { courseId } })) > 0;
    case "MID_MARKS": return (await prisma.studentMark.count({ where: { courseId, instrument: { type: "Midterm" } } as never })) > 0;
    case "FINAL_MARKS": return (await prisma.studentMark.count({ where: { courseId, instrument: { type: "Final" } } as never })) > 0;
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
 * A standing deadline ("allCourses") is a template that is never shown itself.
 * - Course work: every course in the setter's area gets its own row, including courses added later.
 * - Plan task "ONE:": one row for the setter's area, ticked off by whoever holds the role.
 * - Plan task "EACH:": one row for every person holding the role in the setter's area, including people who join later.
 * Works in a handful of queries per setter, however many templates there are.
 */
export async function topUpStanding(chairmanId: string) {
  type T = { id: string; planTerm: string | null; planKey: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; dueDate: Date };
  const templates = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: true } as never })) as unknown as T[];
  if (!templates.length) return;
  const bySetter = new Map<string, T[]>();
  for (const t of templates) bySetter.set(t.setById, [...(bySetter.get(t.setById) || []), t]);
  for (const [setById, list] of Array.from(bySetter.entries())) {
    const setter = await prisma.user.findUnique({ where: { id: setById }, select: { id: true, role: true, managedById: true, facultyId: true, departmentId: true } });
    if (!setter || !SETTER_ROLES.includes(setter.role)) continue;
    const { leadIds, people } = await reach(setter);
    const needCourses = list.some((t) => !t.planKey);
    const courses = needCourses && leadIds.length ? await workCourses({ coordinatorId: { in: leadIds } }) : [];
    const existing = (await prisma.deadline.findMany({ where: { chairmanId, setById, allCourses: false } as never, select: { title: true, dueDate: true, courseId: true, assigneeId: true } })) as unknown as { title: string; dueDate: Date; courseId: string | null; assigneeId: string | null }[];
    const have = new Set(existing.map((e) => `${e.title}|${e.dueDate.getTime()}|${e.courseId || ""}|${e.assigneeId || ""}`));
    const toMake: Record<string, unknown>[] = [];
    for (const t of list) {
      const base = { chairmanId, setById, kind: t.kind, title: t.title, description: t.description, dueDate: t.dueDate, planTerm: t.planTerm, planKey: t.planKey, role: t.role };
      const k = (course: string, who: string) => `${t.title}|${t.dueDate.getTime()}|${course}|${who}`;
      if (t.planKey) {
        if (t.planKey.split(":")[0] === "ONE") {
          const anyOne = existing.some((e) => e.title === t.title && e.dueDate.getTime() === t.dueDate.getTime() && !e.courseId);
          if (!anyOne) toMake.push({ ...base, assigneeId: null, courseId: null });
        } else {
          for (const h of people.filter((p) => t.role && p.hats.includes(t.role))) if (!have.has(k("", h.id))) toMake.push({ ...base, assigneeId: h.id, courseId: null });
        }
      } else {
        for (const c of courses) if (courseFitsTarget(c, t) && !have.has(k(c.id, ""))) toMake.push({ ...base, assigneeId: null, courseId: c.id });
      }
    }
    for (let i = 0; i < toMake.length; i += 500) await prisma.deadline.createMany({ data: toMake.slice(i, i + 500) as never });
  }
}

/**
 * The usual order of work in a semester, with suggested days from the semester start (negative = before it starts).
 * scope COURSE = tracked per course; EACH = one for every person holding the role; ONE = one for the area, ticked by whoever holds the role.
 * days = how long the work usually takes, used to draw the bar on the chart.
 */
export type PlanItem = { key: string; kind: string; title: string; role: string; offset: number; days: number; scope: "COURSE" | "EACH" | "ONE"; phase: string; why: string };
export const PLAN_TEMPLATE: PlanItem[] = [
  { key: "ADMISSION_DATA", kind: "CUSTOM", title: "Admission criteria and intake figures updated", role: "STUDENT_AFFAIRS", offset: -70, days: 14, scope: "EACH", phase: "Before the semester", why: "Admission criteria and intake figures are current" },
  { key: "FACULTY_ENTRY", kind: "CUSTOM", title: "Faculty data entered and checked", role: "HEAD_OF_DEPARTMENT", offset: -65, days: 14, scope: "EACH", phase: "Before the semester", why: "Every teacher in the department is listed correctly" },
  { key: "STUDENT_ENTRY", kind: "CUSTOM", title: "Student data entered", role: "PROGRAM_COORDINATOR", offset: -60, days: 14, scope: "EACH", phase: "Before the semester", why: "Students of every batch are in the system" },
  { key: "SHARED_FACULTY", kind: "CUSTOM", title: "Shared faculty requests sent", role: "HEAD_OF_DEPARTMENT", offset: -60, days: 10, scope: "EACH", phase: "Before the semester", why: "Teachers needed from other departments are requested" },
  { key: "MISSION_VISION", kind: "CUSTOM", title: "Mission and vision checked against the program", role: "HEAD_OF_DEPARTMENT", offset: -55, days: 7, scope: "EACH", phase: "Before the semester", why: "Program objectives still agree with the mission and vision" },
  { key: "LIBRARY", kind: "CUSTOM", title: "Library record updated", role: "LIBRARIAN", offset: -55, days: 10, scope: "EACH", phase: "Before the semester", why: "Books, magazines and titles for the program are current" },
  { key: "PLO_MAP", kind: "PLO_MAP", title: "Course-to-GA mapping complete", role: "PROGRAM_COORDINATOR", offset: -50, days: 14, scope: "COURSE", phase: "Courses and outcomes", why: "Every course is mapped to the GAs it serves" },
  { key: "COURSES_OFFERED", kind: "CUSTOM", title: "Courses to be offered decided", role: "PROGRAM_COORDINATOR", offset: -48, days: 7, scope: "EACH", phase: "Before the semester", why: "The list of courses offered this semester is final" },
  { key: "COURSE_UPDATE", kind: "CUSTOM", title: "Course contents updated", role: "SUBJECT_EXPERT", offset: -45, days: 10, scope: "EACH", phase: "Courses and outcomes", why: "Course contents reviewed and updated where needed" },
  { key: "CLO_SET", kind: "CLO_SET", title: "CLOs written for every course", role: "SUBJECT_EXPERT", offset: -40, days: 10, scope: "COURSE", phase: "Courses and outcomes", why: "Subject Experts write the course learning outcomes" },
  { key: "PROFILE", kind: "CUSTOM", title: "Faculty profile updated", role: "INSTRUCTOR", offset: -40, days: 14, scope: "EACH", phase: "Before the semester", why: "Every teacher updates qualifications and experience" },
  { key: "ELECTIVES", kind: "CUSTOM", title: "Elective courses for the semester decided", role: "PROGRAM_COORDINATOR", offset: -42, days: 10, scope: "EACH", phase: "Allocation and timetable", why: "Each program decides which electives it offers, so allocation and the timetable can follow" },
  { key: "LAB_PLAN", kind: "CUSTOM", title: "Lab tasks named, linked to lecture topics, manuals and solutions uploaded", role: "LAB_ENGINEER", offset: -14, days: 14, scope: "EACH", phase: "Labs and facilities", why: "Every lab task has a week and the lecture topics it practises, with its manual and solution uploaded (ticks itself)" },
  { key: "LAB_APPROVE", kind: "CUSTOM", title: "Lab manuals and solutions reviewed and approved", role: "INSTRUCTOR", offset: -5, days: 7, scope: "EACH", phase: "Labs and facilities", why: "The teacher of each course with a lab approves its manuals and solutions (ticks itself; teachers with no lab are ticked)" },
  { key: "PRIORITIES", kind: "CUSTOM", title: "Course and timetable priorities sent", role: "INSTRUCTOR", offset: -35, days: 10, scope: "EACH", phase: "Allocation and timetable", why: "Teachers tell the Chairman the courses and time slots they prefer" },
  { key: "CLO_PLO", kind: "CLO_PLO", title: "Every CLO mapped to a GA", role: "SUBJECT_EXPERT", offset: -35, days: 5, scope: "COURSE", phase: "Courses and outcomes", why: "Each CLO says which GA it supports" },
  { key: "OMC_BEFORE", kind: "CUSTOM", title: "OMC meeting held and minutes filed (before the semester)", role: "PROGRAM_COORDINATOR", offset: -30, days: 3, scope: "EACH", phase: "Meetings", why: "Outcome Monitoring Committee approves the semester's courses" },
  { key: "ALLOCATION", kind: "CUSTOM", title: "Courses allocated to teachers", role: "HEAD_OF_DEPARTMENT", offset: -28, days: 7, scope: "EACH", phase: "Allocation and timetable", why: "Every course has an Instructor, using the teachers' priorities" },
  { key: "LECTURE_PLAN", kind: "LECTURE_PLAN", title: "Lecture plan built and mapped to CLOs", role: "SUBJECT_EXPERT", offset: -28, days: 14, scope: "COURSE", phase: "Courses and outcomes", why: "Every lecture topic is tied to a CLO" },
  { key: "ASSESSMENT_PLAN", kind: "ASSESSMENT_PLAN", title: "Quizzes, assignments and exams planned", role: "SUBJECT_EXPERT", offset: -21, days: 7, scope: "COURSE", phase: "Courses and outcomes", why: "How many and on which topics" },
  { key: "OMC_TASKS", kind: "CUSTOM", title: "OMC tasks for the semester completed", role: "PROGRAM_COORDINATOR", offset: -18, days: 10, scope: "EACH", phase: "Meetings", why: "Reviews and approvals the OMC owes before classes begin" },
  { key: "TIMETABLE", kind: "CUSTOM", title: "Timetable generated and published", role: "HEAD_OF_DEPARTMENT", offset: -14, days: 10, scope: "EACH", phase: "Allocation and timetable", why: "Timetable for every batch is ready and shared" },
  { key: "PAPERS", kind: "PAPERS", title: "Midterm and final paper distribution set", role: "SUBJECT_EXPERT", offset: -14, days: 7, scope: "COURSE", phase: "Courses and outcomes", why: "Marks per CLO in each paper" },
  { key: "SUBMITTED", kind: "SUBMITTED", title: "Course submitted to the OMC", role: "SUBJECT_EXPERT", offset: -10, days: 4, scope: "COURSE", phase: "Courses and outcomes", why: "The course sheet goes for review" },
  { key: "ATTENDANCE", kind: "ATTENDANCE", title: "Attendance being recorded", role: "INSTRUCTOR", offset: 21, days: 21, scope: "COURSE", phase: "During the semester", why: "Attendance for the first weeks is in" },
  { key: "FACULTY_MEETING", kind: "CUSTOM", title: "Faculty meeting held and minutes filed", role: "HEAD_OF_DEPARTMENT", offset: 25, days: 3, scope: "EACH", phase: "Meetings", why: "Departmental faculty meeting with minutes" },
  { key: "CHECK_1", kind: "CUSTOM", title: "Attendance and marks entry checked (checkpoint 1)", role: "HEAD_OF_DEPARTMENT", offset: 35, days: 5, scope: "EACH", phase: "During the semester", why: "Chairman checks attendance and first assessments are entered" },
  { key: "BOS", kind: "CUSTOM", title: "BOS meeting held and minutes filed", role: "HEAD_OF_DEPARTMENT", offset: 50, days: 3, scope: "EACH", phase: "Meetings", why: "Board of Studies meeting with minutes" },
  { key: "BPF", kind: "CUSTOM", title: "BPF meeting held and minutes filed", role: "HEAD_OF_DEPARTMENT", offset: 55, days: 3, scope: "EACH", phase: "Meetings", why: "BPF meeting with minutes" },
  { key: "OMC_MID", kind: "CUSTOM", title: "OMC meeting held and minutes filed (mid semester)", role: "PROGRAM_COORDINATOR", offset: 60, days: 3, scope: "EACH", phase: "Meetings", why: "Outcome Monitoring Committee reviews progress" },
  { key: "CHECK_2", kind: "CUSTOM", title: "Attendance and marks entry checked (checkpoint 2)", role: "HEAD_OF_DEPARTMENT", offset: 70, days: 5, scope: "EACH", phase: "During the semester", why: "Midterm marks and attendance are in" },
  { key: "ECA", kind: "CUSTOM", title: "Extra-curricular activities updated", role: "HEAD_OF_DEPARTMENT", offset: 100, days: 14, scope: "EACH", phase: "During the semester", why: "Student activities of the semester are recorded" },
  { key: "CHECK_3", kind: "CUSTOM", title: "Attendance and marks entry checked (checkpoint 3)", role: "HEAD_OF_DEPARTMENT", offset: 105, days: 5, scope: "EACH", phase: "During the semester", why: "Final assessments and attendance are in" },
  { key: "MARKS", kind: "MARKS", title: "Marks entered", role: "INSTRUCTOR", offset: 119, days: 14, scope: "COURSE", phase: "During the semester", why: "All marks are in so reports can be produced" },
  { key: "BUDGET_ENTRY", kind: "CUSTOM", title: "Budget and income figures entered", role: "FINANCE_OFFICER", offset: -60, days: 14, scope: "EACH", phase: "Before the semester", why: "Budget by category for the year is in, so accreditation can see lab, library and training funds" },
  { key: "STOCK_CHECK", kind: "CUSTOM", title: "Library stock check done", role: "LIBRARIAN", offset: -40, days: 10, scope: "EACH", phase: "Labs and facilities", why: "Titles, volumes and journals are counted and the record is current" },
  { key: "SPEND_MID", kind: "CUSTOM", title: "Spending figures updated (mid year)", role: "FINANCE_OFFICER", offset: 90, days: 10, scope: "EACH", phase: "During the semester", why: "What was actually spent so far is recorded" },
  { key: "SPEND_END", kind: "CUSTOM", title: "Spending and income figures updated (year end)", role: "FINANCE_OFFICER", offset: 140, days: 10, scope: "EACH", phase: "Semester close", why: "Final spending and income for the year are recorded" },
  { key: "FAC_CALENDAR", kind: "CUSTOM", title: "Faculty academic calendar published", role: "DEAN", offset: -75, days: 7, scope: "EACH", phase: "Before the semester", why: "Dean adds the faculty's own dates to the institute calendar" },
  { key: "VISITING", kind: "CUSTOM", title: "Visiting faculty appointed", role: "HEAD_OF_DEPARTMENT", offset: -32, days: 14, scope: "EACH", phase: "Allocation and timetable", why: "Visiting teachers needed for the semester are appointed" },
  { key: "LAB_REQ", kind: "CUSTOM", title: "Lab equipment and consumables requirements submitted", role: "LAB_MANAGER", offset: -50, days: 14, scope: "EACH", phase: "Labs and facilities", why: "What each lab needs for the semester is requested" },
  { key: "LAB_MANUAL", kind: "CUSTOM", title: "Lab manuals updated", role: "LAB_ENGINEER", offset: -30, days: 14, scope: "EACH", phase: "Labs and facilities", why: "Experiments match the course CLOs" },
  { key: "ROOMS", kind: "CUSTOM", title: "Classrooms and labs allotted", role: "HEAD_OF_DEPARTMENT", offset: -21, days: 7, scope: "EACH", phase: "Allocation and timetable", why: "Rooms and labs are booked for every section" },
  { key: "LAB_READY", kind: "CUSTOM", title: "Lab readiness checked", role: "LAB_MANAGER", offset: -10, days: 7, scope: "EACH", phase: "Labs and facilities", why: "Equipment works and labs are safe to use" },
  { key: "REGISTRATION", kind: "CUSTOM", title: "Student course registration completed", role: "PROGRAM_COORDINATOR", offset: -5, days: 10, scope: "EACH", phase: "Before the semester", why: "Every student is registered in the right courses" },
  { key: "ORIENTATION", kind: "CUSTOM", title: "Orientation of new students held", role: "PROGRAM_COORDINATOR", offset: 0, days: 3, scope: "EACH", phase: "Before the semester", why: "New students are told about the program, rules and outcomes" },
  { key: "FYP", kind: "CUSTOM", title: "Final year project topics and supervisors allotted", role: "HEAD_OF_DEPARTMENT", offset: 7, days: 10, scope: "EACH", phase: "During the semester", why: "Every final year group has a topic and a supervisor" },
  { key: "OUTLINE", kind: "CUSTOM", title: "Course outline given to students", role: "INSTRUCTOR", offset: 7, days: 7, scope: "EACH", phase: "During the semester", why: "Students receive the outline with CLOs and marking scheme" },
  { key: "COUNSEL", kind: "CUSTOM", title: "Student counselling session held", role: "PROGRAM_COORDINATOR", offset: 40, days: 7, scope: "EACH", phase: "During the semester", why: "Counselling sessions with students are recorded" },
  { key: "PAPER_MID", kind: "CUSTOM", title: "Midterm papers set and approved", role: "SUBJECT_EXPERT", offset: 42, days: 10, scope: "EACH", phase: "Exams and assessment", why: "Midterm papers follow the paper distribution" },
  { key: "SURVEY_MID", kind: "CUSTOM", title: "Mid-semester course evaluation survey conducted", role: "PROGRAM_COORDINATOR", offset: 50, days: 7, scope: "EACH", phase: "Exams and assessment", why: "Students rate courses and teaching" },
  { key: "MID_EXAM", kind: "MID_MARKS", title: "Midterm marks entered", role: "INSTRUCTOR", offset: 63, days: 7, scope: "COURSE", phase: "Exams and assessment", why: "Midterm marks are entered for every course" },
  { key: "SHORTAGE", kind: "CUSTOM", title: "Attendance shortage list shared", role: "INSTRUCTOR", offset: 60, days: 5, scope: "EACH", phase: "Exams and assessment", why: "Students below the attendance limit are informed" },
  { key: "FYP_MID", kind: "CUSTOM", title: "Final year project mid evaluation held", role: "HEAD_OF_DEPARTMENT", offset: 70, days: 7, scope: "EACH", phase: "During the semester", why: "Supervisors and the committee review progress" },
  { key: "IAB", kind: "CUSTOM", title: "Industrial advisory board meeting held and minutes filed", role: "HEAD_OF_DEPARTMENT", offset: 80, days: 3, scope: "EACH", phase: "Meetings", why: "Industry gives feedback on the program" },
  { key: "PO_REVIEW", kind: "CUSTOM", title: "Program objectives, graduate attributes and CLOs reviewed", role: "PROGRAM_COORDINATOR", offset: 90, days: 10, scope: "EACH", phase: "During the semester", why: "Review of POs, GAs and CLOs is recorded for accreditation" },
  { key: "PAPER_FINAL", kind: "CUSTOM", title: "Final papers set and approved", role: "SUBJECT_EXPERT", offset: 100, days: 10, scope: "EACH", phase: "Exams and assessment", why: "Final papers follow the paper distribution" },
  { key: "SURVEY_END", kind: "CUSTOM", title: "End-of-semester course evaluation survey conducted", role: "PROGRAM_COORDINATOR", offset: 105, days: 7, scope: "EACH", phase: "Exams and assessment", why: "Students rate courses and teachers at the end" },
  { key: "EXIT", kind: "CUSTOM", title: "Graduating student exit survey conducted", role: "PROGRAM_COORDINATOR", offset: 110, days: 7, scope: "EACH", phase: "Semester close", why: "Final year students give their feedback on the program" },
  { key: "FINAL_EXAM", kind: "FINAL_MARKS", title: "Final exam marks entered", role: "INSTRUCTOR", offset: 118, days: 7, scope: "COURSE", phase: "Exams and assessment", why: "Final exam marks are entered for every course" },
  { key: "RESULTS", kind: "CUSTOM", title: "Final results submitted", role: "INSTRUCTOR", offset: 125, days: 5, scope: "EACH", phase: "Semester close", why: "Grades are submitted for every course taught" },
  { key: "FOLDER", kind: "CUSTOM", title: "Course folders completed", role: "INSTRUCTOR", offset: 130, days: 10, scope: "EACH", phase: "Semester close", why: "Every course folder holds the papers, solutions and samples" },
  { key: "ATTAIN", kind: "CUSTOM", title: "CLO and GA attainment reviewed", role: "SUBJECT_EXPERT", offset: 135, days: 10, scope: "EACH", phase: "Semester close", why: "Subject Experts review how well each CLO was met" },
  { key: "OBE_REPORT", kind: "CUSTOM", title: "Semester OBE report reviewed", role: "HEAD_OF_DEPARTMENT", offset: 140, days: 7, scope: "EACH", phase: "Semester close", why: "Chairman reviews the attainment and readiness reports" },
  { key: "IMPROVE", kind: "CUSTOM", title: "Improvement actions recorded", role: "PROGRAM_COORDINATOR", offset: 145, days: 7, scope: "EACH", phase: "Semester close", why: "Actions for the next semester are written down and assigned" },
  { key: "DEAN_REVIEW", kind: "CUSTOM", title: "Faculty accreditation readiness reviewed", role: "DEAN", offset: 150, days: 7, scope: "EACH", phase: "Semester close", why: "Dean reviews each program's readiness and gaps" },
];
PLAN_TEMPLATE.sort((a, b) => a.offset - b.offset);
/** Phases in the order the work happens; tasks the Institute Head adds go into one of these. */
export const PLAN_PHASES = ["Before the semester", "Allocation and timetable", "Courses and outcomes", "During the semester", "Labs and facilities", "Meetings", "Exams and assessment", "Semester close", "Other"];
/** Tasks the Institute Head adds have keys like custom.<phase number>.<slug>. */
export function customKey(phase: string, title: string) {
  const i = Math.max(0, PLAN_PHASES.indexOf(phase));
  return `custom.${i}.${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task"}`;
}
/** Days and phase for a plan key, whether a built-in task or one the Institute Head added. */
export function planMeta(key: string | null | undefined): { days: number; phase: string } {
  const t = PLAN_TEMPLATE.find((p) => p.key === key);
  if (t) return { days: t.days, phase: t.phase };
  const m = /^custom\.(\d+)\./.exec(key || "");
  return { days: 7, phase: m ? PLAN_PHASES[+m[1]] || "Other" : "Other" };
}
/** Roles a plan task can be given to. */
export const PLAN_ROLES = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_MANAGER", "LAB_ENGINEER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS"];
export const RANK: Record<string, number> = { CHAIRMAN: 0, DEAN: 1, HEAD_OF_DEPARTMENT: 2, DEPARTMENT_COORDINATOR: 3, PROGRAM_COORDINATOR: 4 };

/** Which of these courses already have the work a kind of deadline asks for? One batch of queries per kind, not per course. */
async function doneSets(kinds: string[], courseIds: string[]) {
  const out = new Map<string, Set<string>>();
  if (!courseIds.length) return out;
  const inList = { in: courseIds };
  const distinct = (rows: unknown) => new Set((rows as { courseId: string }[]).map((r) => r.courseId));
  for (const kind of kinds) {
    switch (kind) {
      case "PLO_MAP": out.set(kind, distinct(await prisma.coursePloMapping.findMany({ where: { courseId: inList }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      case "CLO_SET": out.set(kind, distinct(await prisma.cLO.findMany({ where: { courseId: inList, source: "SE" }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      case "CLO_PLO": {
        const rows = (await prisma.cLO.findMany({ where: { courseId: inList, source: "SE" }, select: { courseId: true, mappedPloId: true } } as never)) as unknown as { courseId: string; mappedPloId: string | null }[];
        const bad = new Set(rows.filter((r) => !r.mappedPloId).map((r) => r.courseId));
        out.set(kind, new Set(rows.filter((r) => !bad.has(r.courseId)).map((r) => r.courseId))); break;
      }
      case "LECTURE_PLAN": {
        // Done once the plan meets the OMC's minimum topics per CLO / PLO (same rule as the course progress steps).
        const cs = await prisma.course.findMany({ where: { id: inList }, select: { id: true, courseType: true, coordinatorId: true, templateStatus: true } });
        const prog = await seProgressFor(cs);
        out.set(kind, new Set(cs.filter((c) => prog.get(c.id)?.[1]?.done).map((c) => c.id))); break;
      }
      case "ASSESSMENT_PLAN": out.set(kind, distinct(await prisma.assessmentInstrument.findMany({ where: { courseId: inList, source: "SE" }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      case "PAPERS": {
        const rows = (await prisma.paperDistributionItem.findMany({ where: { courseId: inList }, select: { courseId: true, examType: true, source: true } } as never)) as unknown as { courseId: string; examType: string; source: string }[];
        for (const src of ["SE", "INSTRUCTOR"]) {
          const mid = new Set(rows.filter((r) => r.source === src && r.examType === "Midterm").map((r) => r.courseId));
          out.set(`PAPERS|${src}`, new Set(rows.filter((r) => r.source === src && r.examType === "Final" && mid.has(r.courseId)).map((r) => r.courseId)));
        }
        break;
      }
      case "SUBMITTED": {
        const rows = (await prisma.course.findMany({ where: { id: inList }, select: { id: true, templateStatus: true } } as never)) as unknown as { id: string; templateStatus: string | null }[];
        out.set(kind, new Set(rows.filter((r) => r.templateStatus !== "draft" && r.templateStatus !== "changes-requested" && r.templateStatus !== "reopened").map((r) => r.id))); break;
      }
      case "MARKS": out.set(kind, distinct(await prisma.studentMark.findMany({ where: { courseId: inList }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      case "MID_MARKS": case "FINAL_MARKS": out.set(kind, distinct(await prisma.studentMark.findMany({ where: { courseId: inList, instrument: { type: kind === "MID_MARKS" ? "Midterm" : "Final" } }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      case "ATTENDANCE": out.set(kind, distinct(await prisma.attendanceRecord.findMany({ where: { courseId: inList }, select: { courseId: true }, distinct: ["courseId"] } as never))); break;
      default: break;
    }
  }
  return out;
}

/** Stamp the first time we see that the work behind a course deadline has been done (a few queries for all rows together). */
export async function stampDone(rows: { id: string; kind: string; courseId: string | null; role: string | null; completedAt: Date | null }[]) {
  const open = rows.filter((r) => !r.completedAt && r.courseId);
  if (!open.length) return;
  const sets = await doneSets(Array.from(new Set(open.map((r) => r.kind))), Array.from(new Set(open.map((r) => r.courseId as string))));
  const now = new Date();
  const done: string[] = [];
  for (const r of open) {
    const role = r.role || KIND_ROLE[r.kind];
    const set = r.kind === "PAPERS" ? sets.get(`PAPERS|${role === "INSTRUCTOR" ? "INSTRUCTOR" : "SE"}`) : sets.get(r.kind);
    if (set?.has(r.courseId as string)) { r.completedAt = now; done.push(r.id); }
  }
  if (done.length) await prisma.deadline.updateMany({ where: { id: { in: done } }, data: { completedAt: now } });
}

export type PlanState = "BEHIND" | "AT_RISK" | "ON_TRACK" | "COMPLETE";
export type PlanLine = {
  id: string; title: string; kind: string; planKey: string | null; days: number; phase: string; role: string | null; planTerm: string | null; dueDate: Date; setBy: string; setById: string; mine: boolean;
  total: number; done: number; late: number; behind: number; state: PlanState; daysLeft: number;
  notDone: { courseId: string; label: string; who: string; whoId: string }[];
  passed: { by: string; dueDate: Date; slack: number }[];
};

/** How far every standing target in the user's area has got. Highlights what is behind. */
export async function planProgress(user: U, opts: { stamp?: boolean } = {}): Promise<PlanLine[]> {
  const chairmanId = chairmanOf(user);
  await topUpStanding(chairmanId);
  const { leadIds, people } = await reach(user);
  const myPeople = new Set(people.map((p) => p.id));
  const templates = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: true } as never, orderBy: { dueDate: "asc" } })) as unknown as { id: string; parentId: string | null; planKey: string | null; planTerm: string | null; role: string | null; setById: string; kind: string; title: string; dueDate: Date }[];
  const setters = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(templates.map((t) => t.setById))) } }, select: { id: true, name: true, role: true } })).map((u) => [u.id as string, u as { id: string; name: string; role: string }]));
  const myRank = RANK[user.role] ?? 9;
  const visible = templates.filter((t) => t.setById === user.id || (RANK[setters.get(t.setById)?.role || ""] ?? 9) < myRank || user.role === "CHAIRMAN");
  const courses = leadIds.length ? await workCourses({ coordinatorId: { in: leadIds } }) : [];
  const courseIds = courses.map((c) => c.id);
  const cMap = new Map(courses.map((c) => [c.id, c]));
  const now = new Date();
  const flat = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: false, planTerm: { not: null } } as never, select: { id: true, kind: true, courseId: true, role: true, completedAt: true, assigneeId: true, setById: true, title: true, dueDate: true } })) as unknown as { id: string; kind: string; courseId: string | null; role: string | null; completedAt: Date | null; assigneeId: string | null; setById: string; title: string; dueDate: Date }[];
  const courseSet = new Set(courseIds);
  const allRows = new Map<string, typeof flat>();
  for (const r of flat) { const k = `${r.setById}|${r.title}|${r.dueDate.getTime()}`; allRows.set(k, [...(allRows.get(k) || []), r]); }
  if (opts.stamp !== false) {
    await stampDone(flat.filter((r) => r.courseId && courseSet.has(r.courseId)));
    const plainOpen: { id: string; key: string; assigneeId: string | null; dueDate: Date; completedAt: Date | null }[] = [];
    for (const t of visible) {
      if (!t.planKey) continue;
      const key = t.planKey.split(":")[1];
      for (const r of allRows.get(`${t.setById}|${t.title}|${t.dueDate.getTime()}`) || []) if (!r.courseId && !r.completedAt) plainOpen.push({ id: r.id, key, assigneeId: r.assigneeId, dueDate: r.dueDate, completedAt: null });
    }
    await autoTick(chairmanId, plainOpen);
    for (const p of plainOpen) if (p.completedAt) for (const rs of Array.from(allRows.values())) { const hit = rs.find((x) => x.id === p.id); if (hit) hit.completedAt = p.completedAt; }
  }
  const lines: PlanLine[] = [];
  for (const t of visible) {
    const plain = !!t.planKey;
    const rawRows = (allRows.get(`${t.setById}|${t.title}|${t.dueDate.getTime()}`) || []).filter((r) => (plain ? !r.courseId : !!r.courseId && courseSet.has(r.courseId)));
    const rows = plain && user.role !== "CHAIRMAN" ? rawRows.filter((r) => !r.assigneeId || myPeople.has(r.assigneeId) || t.setById === user.id) : rawRows;
    const end = new Date(t.dueDate.getTime() + 86400000 - 1);
    const done = rows.filter((r) => r.completedAt).length;
    const late = rows.filter((r) => r.completedAt && r.completedAt > end).length;
    const open = rows.filter((r) => !r.completedAt);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
    const behind = now > end ? open.length : 0;
    let state: PlanState = rows.length && done === rows.length ? "COMPLETE" : behind > 0 ? "BEHIND" : daysLeft <= 14 && rows.length > 0 && done / rows.length < 0.5 ? "AT_RISK" : "ON_TRACK";
    const role = t.role || KIND_ROLE[t.kind];
    const notDone = open.slice(0, 40).map((r) => {
      if (plain) return { courseId: r.id, label: ROLE_LABEL[role as string] || String(role || ""), who: r.assigneeId || "", whoId: r.assigneeId || "" };
      const c = cMap.get(r.courseId as string);
      const who = role === "INSTRUCTOR" ? c?.instructorId : role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.subjectExpertId;
      return { courseId: r.courseId as string, label: c ? `${c.code} ${c.title}` : "—", who: who || "", whoId: who || "" };
    });
    const kids = templates.filter((k) => k.parentId === t.id);
    lines.push({
      id: t.id, title: t.title, kind: t.kind, planKey: t.planKey, days: planMeta(t.planKey ? t.planKey.split(":")[1] : t.kind).days, phase: planMeta(t.planKey ? t.planKey.split(":")[1] : t.kind).phase, role, planTerm: t.planTerm, dueDate: t.dueDate, setBy: setters.get(t.setById)?.name || "—", setById: t.setById, mine: t.setById === user.id,
      total: rows.length, done, late, behind, state, daysLeft, notDone,
      passed: kids.map((k) => ({ by: setters.get(k.setById)?.name || "—", dueDate: k.dueDate, slack: Math.round((t.dueDate.getTime() - k.dueDate.getTime()) / 86400000) })),
    });
  }
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(lines.flatMap((l) => l.notDone.map((n) => n.who).filter(Boolean)))) } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  for (const l of lines) for (const n of l.notDone) n.who = n.who ? names.get(n.who) || "—" : "";
  return lines;
}
