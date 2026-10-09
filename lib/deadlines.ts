import { prisma } from "./db";
import { hatsOf } from "./dualRoles";

export const DEADLINE_KINDS: Record<string, string> = {
  CUSTOM: "Any task", PLO_MAP: "Course mapped to PLOs", CLO_PLO: "CLOs mapped to PLOs", CLO_SET: "CLOs written", LECTURE_PLAN: "Lecture plan built and mapped to CLOs", ASSESSMENT_PLAN: "Quizzes / assignments / exams set up",
  PAPERS: "Midterm and final paper distribution set", SUBMITTED: "Course submitted to OMC", MARKS: "Marks entered", ATTENDANCE: "Attendance recorded",
};
export const COURSE_KINDS = Object.keys(DEADLINE_KINDS).filter((k) => k !== "CUSTOM");
export const ROLE_LABEL: Record<string, string> = {
  DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead",
  SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager", LIBRARIAN: "Librarian", FINANCE_OFFICER: "Finance Officer",
};
/** The role a piece of course work belongs to. null = the setter chooses (papers) or it is a free task. */
export const KIND_ROLE: Record<string, string | null> = {
  CUSTOM: null, PLO_MAP: "PROGRAM_COORDINATOR", CLO_PLO: "SUBJECT_EXPERT", CLO_SET: "SUBJECT_EXPERT", LECTURE_PLAN: "SUBJECT_EXPERT", ASSESSMENT_PLAN: "SUBJECT_EXPERT", SUBMITTED: "SUBJECT_EXPERT",
  PAPERS: null, MARKS: "INSTRUCTOR", ATTENDANCE: "INSTRUCTOR",
};
export const SETTER_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const PEOPLE_ROLES = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER"];

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
 * A standing deadline ("allCourses") is a template that is never shown itself.
 * - Course work: every course in the setter's area gets its own row, including courses added later.
 * - Plan task "ONE:": one row for the setter's area, ticked off by whoever holds the role.
 * - Plan task "EACH:": one row for every person holding the role in the setter's area, including people who join later.
 */
export async function topUpStanding(chairmanId: string) {
  const templates = (await prisma.deadline.findMany({ where: { chairmanId, allCourses: true } as never })) as unknown as { id: string; planTerm: string | null; planKey: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; dueDate: Date }[];
  for (const t of templates) {
    const setter = await prisma.user.findUnique({ where: { id: t.setById }, select: { id: true, role: true, managedById: true, facultyId: true, departmentId: true } });
    if (!setter || !SETTER_ROLES.includes(setter.role)) continue;
    const { leadIds, people } = await reach(setter);
    const base = { chairmanId, setById: t.setById, kind: t.kind, title: t.title, description: t.description, dueDate: t.dueDate, planTerm: t.planTerm, planKey: t.planKey };
    if (t.planKey) {
      const scope = t.planKey.split(":")[0];
      if (scope === "ONE") {
        const have = await prisma.deadline.findFirst({ where: { chairmanId, setById: t.setById, title: t.title, dueDate: t.dueDate, courseId: null, allCourses: false } as never, select: { id: true } });
        if (!have) await prisma.deadline.create({ data: { ...base, assigneeId: null, role: t.role, courseId: null } as never });
      } else {
        const holders = people.filter((p) => t.role && p.hats.includes(t.role));
        const have = new Set((await prisma.deadline.findMany({ where: { chairmanId, setById: t.setById, title: t.title, dueDate: t.dueDate, courseId: null, allCourses: false } as never, select: { assigneeId: true } })).map((x) => x.assigneeId as string));
        const missing = holders.filter((h) => !have.has(h.id));
        if (missing.length) await prisma.deadline.createMany({ data: missing.map((h) => ({ ...base, assigneeId: h.id, role: t.role, courseId: null })) as never });
      }
      continue;
    }
    if (!leadIds.length) continue;
    const courses = await prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true }, take: 1500 });
    const have = new Set((await prisma.deadline.findMany({ where: { chairmanId, setById: t.setById, kind: t.kind, title: t.title, dueDate: t.dueDate, courseId: { not: null } }, select: { courseId: true } })).map((x) => x.courseId as string));
    const missing = courses.filter((c) => !have.has(c.id));
    if (missing.length) await prisma.deadline.createMany({ data: missing.map((c) => ({ ...base, assigneeId: null, role: t.role, courseId: c.id })) as never });
  }
}

/**
 * The usual order of work in a semester, with suggested days from the semester start (negative = before it starts).
 * scope COURSE = tracked per course; EACH = one for every person holding the role; ONE = one for the area, ticked by whoever holds the role.
 * days = how long the work usually takes, used to draw the bar on the chart.
 */
export type PlanItem = { key: string; kind: string; title: string; role: string; offset: number; days: number; scope: "COURSE" | "EACH" | "ONE"; phase: string; why: string };
export const PLAN_TEMPLATE: PlanItem[] = [
  { key: "ADMISSION_DATA", kind: "CUSTOM", title: "Admission data updated", role: "DEAN", offset: -70, days: 14, scope: "EACH", phase: "Before the semester", why: "Admission criteria and intake figures are current" },
  { key: "FACULTY_ENTRY", kind: "CUSTOM", title: "Faculty data entered and checked", role: "HEAD_OF_DEPARTMENT", offset: -65, days: 14, scope: "EACH", phase: "Before the semester", why: "Every teacher in the department is listed correctly" },
  { key: "STUDENT_ENTRY", kind: "CUSTOM", title: "Student data entered", role: "PROGRAM_COORDINATOR", offset: -60, days: 14, scope: "EACH", phase: "Before the semester", why: "Students of every batch are in the system" },
  { key: "SHARED_FACULTY", kind: "CUSTOM", title: "Shared faculty requests sent", role: "HEAD_OF_DEPARTMENT", offset: -60, days: 10, scope: "EACH", phase: "Before the semester", why: "Teachers needed from other departments are requested" },
  { key: "MISSION_VISION", kind: "CUSTOM", title: "Mission and vision checked against the program", role: "HEAD_OF_DEPARTMENT", offset: -55, days: 7, scope: "EACH", phase: "Before the semester", why: "Program objectives still agree with the mission and vision" },
  { key: "LIBRARY", kind: "CUSTOM", title: "Library record updated", role: "LIBRARIAN", offset: -55, days: 10, scope: "EACH", phase: "Before the semester", why: "Books, magazines and titles for the program are current" },
  { key: "PLO_MAP", kind: "PLO_MAP", title: "Course-to-PLO mapping complete", role: "PROGRAM_COORDINATOR", offset: -50, days: 14, scope: "COURSE", phase: "Courses and outcomes", why: "Every course is mapped to the PLOs it serves" },
  { key: "COURSES_OFFERED", kind: "CUSTOM", title: "Courses to be offered decided", role: "PROGRAM_COORDINATOR", offset: -48, days: 7, scope: "EACH", phase: "Before the semester", why: "The list of courses offered this semester is final" },
  { key: "COURSE_UPDATE", kind: "CUSTOM", title: "Course contents updated", role: "SUBJECT_EXPERT", offset: -45, days: 10, scope: "EACH", phase: "Courses and outcomes", why: "Course contents reviewed and updated where needed" },
  { key: "CLO_SET", kind: "CLO_SET", title: "CLOs written for every course", role: "SUBJECT_EXPERT", offset: -40, days: 10, scope: "COURSE", phase: "Courses and outcomes", why: "Subject Experts write the course learning outcomes" },
  { key: "PROFILE", kind: "CUSTOM", title: "Faculty profile updated", role: "INSTRUCTOR", offset: -40, days: 14, scope: "EACH", phase: "Before the semester", why: "Every teacher updates qualifications and experience" },
  { key: "PRIORITIES", kind: "CUSTOM", title: "Course and timetable priorities sent", role: "INSTRUCTOR", offset: -35, days: 10, scope: "EACH", phase: "Allocation and timetable", why: "Teachers tell the Chairman the courses and time slots they prefer" },
  { key: "CLO_PLO", kind: "CLO_PLO", title: "Every CLO mapped to a PLO", role: "SUBJECT_EXPERT", offset: -35, days: 5, scope: "COURSE", phase: "Courses and outcomes", why: "Each CLO says which PLO it supports" },
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
  { key: "MID_EXAM", kind: "CUSTOM", title: "Midterm marks entered", role: "INSTRUCTOR", offset: 63, days: 7, scope: "EACH", phase: "Exams and assessment", why: "Midterm marks are entered for every course" },
  { key: "SHORTAGE", kind: "CUSTOM", title: "Attendance shortage list shared", role: "INSTRUCTOR", offset: 60, days: 5, scope: "EACH", phase: "Exams and assessment", why: "Students below the attendance limit are informed" },
  { key: "FYP_MID", kind: "CUSTOM", title: "Final year project mid evaluation held", role: "HEAD_OF_DEPARTMENT", offset: 70, days: 7, scope: "EACH", phase: "During the semester", why: "Supervisors and the committee review progress" },
  { key: "IAB", kind: "CUSTOM", title: "Industrial advisory board meeting held and minutes filed", role: "HEAD_OF_DEPARTMENT", offset: 80, days: 3, scope: "EACH", phase: "Meetings", why: "Industry gives feedback on the program" },
  { key: "PO_REVIEW", kind: "CUSTOM", title: "Program objectives, graduate attributes and CLOs reviewed", role: "PROGRAM_COORDINATOR", offset: 90, days: 10, scope: "EACH", phase: "During the semester", why: "Review of POs, GAs and CLOs is recorded for accreditation" },
  { key: "PAPER_FINAL", kind: "CUSTOM", title: "Final papers set and approved", role: "SUBJECT_EXPERT", offset: 100, days: 10, scope: "EACH", phase: "Exams and assessment", why: "Final papers follow the paper distribution" },
  { key: "SURVEY_END", kind: "CUSTOM", title: "End-of-semester course evaluation survey conducted", role: "PROGRAM_COORDINATOR", offset: 105, days: 7, scope: "EACH", phase: "Exams and assessment", why: "Students rate courses and teachers at the end" },
  { key: "EXIT", kind: "CUSTOM", title: "Graduating student exit survey conducted", role: "PROGRAM_COORDINATOR", offset: 110, days: 7, scope: "EACH", phase: "Semester close", why: "Final year students give their feedback on the program" },
  { key: "RESULTS", kind: "CUSTOM", title: "Final results submitted", role: "INSTRUCTOR", offset: 125, days: 5, scope: "EACH", phase: "Semester close", why: "Grades are submitted for every course taught" },
  { key: "FOLDER", kind: "CUSTOM", title: "Course folders completed", role: "INSTRUCTOR", offset: 130, days: 10, scope: "EACH", phase: "Semester close", why: "Every course folder holds the papers, solutions and samples" },
  { key: "ATTAIN", kind: "CUSTOM", title: "CLO and PLO attainment reviewed", role: "SUBJECT_EXPERT", offset: 135, days: 10, scope: "EACH", phase: "Semester close", why: "Subject Experts review how well each CLO was met" },
  { key: "OBE_REPORT", kind: "CUSTOM", title: "Semester OBE report reviewed", role: "HEAD_OF_DEPARTMENT", offset: 140, days: 7, scope: "EACH", phase: "Semester close", why: "Chairman reviews the attainment and readiness reports" },
  { key: "IMPROVE", kind: "CUSTOM", title: "Improvement actions recorded", role: "PROGRAM_COORDINATOR", offset: 145, days: 7, scope: "EACH", phase: "Semester close", why: "Actions for the next semester are written down and assigned" },
  { key: "DEAN_REVIEW", kind: "CUSTOM", title: "Faculty accreditation readiness reviewed", role: "DEAN", offset: 150, days: 7, scope: "EACH", phase: "Semester close", why: "Dean reviews each program's readiness and gaps" },
];
PLAN_TEMPLATE.sort((a, b) => a.offset - b.offset);
/** Roles a plan task can be given to. */
export const PLAN_ROLES = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_MANAGER", "LAB_ENGINEER", "LIBRARIAN", "FINANCE_OFFICER"];
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
  id: string; title: string; kind: string; planKey: string | null; days: number; phase: string; role: string | null; planTerm: string | null; dueDate: Date; setBy: string; setById: string; mine: boolean;
  total: number; done: number; late: number; behind: number; state: PlanState; daysLeft: number;
  notDone: { courseId: string; label: string; who: string }[];
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
  const courses = leadIds.length ? await prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true }, take: 1500 }) : [];
  const courseIds = courses.map((c) => c.id);
  const cMap = new Map(courses.map((c) => [c.id, c]));
  const now = new Date();
  const lines: PlanLine[] = [];
  for (const t of visible) {
    const plain = !!t.planKey;
    const rawRows = (await prisma.deadline.findMany({ where: plain
      ? { chairmanId, setById: t.setById, title: t.title, dueDate: t.dueDate, courseId: null, allCourses: false }
      : { chairmanId, setById: t.setById, kind: t.kind, title: t.title, dueDate: t.dueDate, courseId: { in: courseIds.length ? courseIds : ["none"] }, allCourses: false } as never, select: { id: true, kind: true, courseId: true, role: true, completedAt: true, assigneeId: true } })) as unknown as { id: string; kind: string; courseId: string | null; role: string | null; completedAt: Date | null; assigneeId: string | null }[];
    const rows = plain && user.role !== "CHAIRMAN" ? rawRows.filter((r) => !r.assigneeId || myPeople.has(r.assigneeId) || t.setById === user.id) : rawRows;
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
      if (plain) return { courseId: r.id, label: ROLE_LABEL[role as string] || String(role || ""), who: r.assigneeId || "" };
      const c = cMap.get(r.courseId as string);
      const who = role === "INSTRUCTOR" ? c?.instructorId : role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.subjectExpertId;
      return { courseId: r.courseId as string, label: c ? `${c.code} ${c.title}` : "—", who: who || "" };
    });
    const kids = templates.filter((k) => k.parentId === t.id);
    lines.push({
      id: t.id, title: t.title, kind: t.kind, planKey: t.planKey, days: (PLAN_TEMPLATE.find((p) => p.key === (t.planKey ? t.planKey.split(":")[1] : t.kind)) || { days: 14 }).days, phase: (PLAN_TEMPLATE.find((p) => p.key === (t.planKey ? t.planKey.split(":")[1] : t.kind)) || { phase: "Other" }).phase, role, planTerm: t.planTerm, dueDate: t.dueDate, setBy: setters.get(t.setById)?.name || "—", setById: t.setById, mine: t.setById === user.id,
      total: rows.length, done, late, behind, state, daysLeft, notDone,
      passed: kids.map((k) => ({ by: setters.get(k.setById)?.name || "—", dueDate: k.dueDate, slack: Math.round((t.dueDate.getTime() - k.dueDate.getTime()) / 86400000) })),
    });
  }
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(lines.flatMap((l) => l.notDone.map((n) => n.who).filter(Boolean)))) } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  for (const l of lines) for (const n of l.notDone) n.who = n.who ? names.get(n.who) || "—" : "";
  return lines;
}
