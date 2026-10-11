import { prisma } from "./db";
import { PLAN_TEMPLATE, KIND_ROLE, ROLE_LABEL } from "./deadlines";

// Which semester tasks need which others finished first. Keys are the semester-plan keys (PLAN_TEMPLATE);
// course work uses its kind (CLO_SET, LECTURE_PLAN ...), and the two exam-marks kinds map to their plan keys.
export const DEPENDS: Record<string, string[]> = {
  CLO_SET: ["COURSE_UPDATE"],
  CLO_PLO: ["PLO_MAP", "CLO_SET"],
  LECTURE_PLAN: ["CLO_SET"],
  ASSESSMENT_PLAN: ["LECTURE_PLAN"],
  PAPERS: ["ASSESSMENT_PLAN"],
  SUBMITTED: ["CLO_PLO", "LECTURE_PLAN", "ASSESSMENT_PLAN", "PAPERS"],
  OMC_TASKS: ["SUBMITTED"],
  OUTLINE: ["SUBMITTED"],
  LAB_MANUAL: ["CLO_SET"],
  ROOMS: ["COURSES_OFFERED"],
  ALLOCATION: ["PRIORITIES", "COURSES_OFFERED"],
  TIMETABLE: ["ALLOCATION", "ROOMS"],
  REGISTRATION: ["COURSES_OFFERED", "STUDENT_ENTRY", "TIMETABLE"],
  ORIENTATION: ["REGISTRATION"],
  ATTENDANCE: ["TIMETABLE", "REGISTRATION"],
  SHORTAGE: ["ATTENDANCE"],
  CHECK_1: ["ATTENDANCE"],
  PAPER_MID: ["PAPERS"],
  PAPER_FINAL: ["PAPERS"],
  MID_EXAM: ["PAPER_MID"],
  CHECK_2: ["MID_EXAM"],
  FINAL_EXAM: ["PAPER_FINAL"],
  CHECK_3: ["FINAL_EXAM"],
  MARKS: ["MID_EXAM"],
  RESULTS: ["FINAL_EXAM", "MARKS"],
  FOLDER: ["RESULTS"],
  ATTAIN: ["RESULTS"],
  OBE_REPORT: ["ATTAIN"],
  IMPROVE: ["OBE_REPORT"],
  DEAN_REVIEW: ["OBE_REPORT"],
  LAB_READY: ["LAB_REQ"],
};
export const DEPENDENTS: Record<string, string[]> = {};
for (const [k, pres] of Object.entries(DEPENDS)) for (const p of pres) (DEPENDENTS[p] = DEPENDENTS[p] || []).push(k);

const KIND_TO_KEY: Record<string, string> = { MID_MARKS: "MID_EXAM", FINAL_MARKS: "FINAL_EXAM" };
const KEY_TO_KIND: Record<string, string> = { MID_EXAM: "MID_MARKS", FINAL_EXAM: "FINAL_MARKS" };
const COURSE_KEYS = new Set(PLAN_TEMPLATE.filter((p) => p.scope === "COURSE").map((p) => p.key));

export type TaskRow = { id: string; kind: string; planKey: string | null; planTerm: string | null; title: string; dueDate: Date; completedAt: Date | null; courseId: string | null; assigneeId: string | null; role: string | null };
/** The plan key of a deadline row, or null for a one-off task (no known order). */
export function taskKey(r: { kind: string; planKey: string | null }): string | null {
  if (r.planKey) return r.planKey.split(":")[1] || null;
  if (r.kind === "CUSTOM") return null;
  return KIND_TO_KEY[r.kind] || r.kind;
}
/** How many days the work usually takes (the bar length on the chart). */
export function taskDays(r: { kind: string; planKey: string | null }) {
  const k = taskKey(r);
  return PLAN_TEMPLATE.find((p) => p.key === k)?.days ?? 7;
}

const DAY = 86400000;
export type Held = { id: string; title: string; dueDate: Date; startDate: Date; who: string; course: string | null; mineToo: boolean; squeezed: boolean };
export type Blocking = { taskId: string; severity: "now" | "soon"; held: Held[] };

/**
 * For each of my unfinished tasks: the unfinished tasks (mine or other people's) that can't start until it is done.
 * "now" = my task is overdue, so the next people are already waiting; "soon" = it is due within 3 days, so a slip
 * will hold them up. squeezed = my due date is later than the date the next task should start.
 */
export async function blockedByMe(chairmanId: string, userId: string, mine: TaskRow[], now = new Date()): Promise<Map<string, Blocking>> {
  const out = new Map<string, Blocking>();
  const open = mine.filter((t) => !t.completedAt && taskKey(t) && DEPENDENTS[taskKey(t)!]);
  if (!open.length) return out;
  const depKeys = Array.from(new Set(open.flatMap((t) => DEPENDENTS[taskKey(t)!])));
  const courseKinds = depKeys.filter((k) => COURSE_KEYS.has(k)).map((k) => KEY_TO_KIND[k] || k);
  const planKeys = depKeys.flatMap((k) => [`EACH:${k}`, `ONE:${k}`]);
  const myCourseIds = Array.from(new Set(open.map((t) => t.courseId).filter((x): x is string => !!x)));
  const terms = Array.from(new Set(open.map((t) => t.planTerm)));
  const cands = (await prisma.deadline.findMany({
    where: {
      chairmanId, allCourses: false, completedAt: null,
      OR: [
        ...(courseKinds.length ? [{ kind: { in: courseKinds }, courseId: { not: null } }] : []),
        { planKey: { in: planKeys } },
      ],
    } as never,
    take: 3000,
  })) as unknown as TaskRow[];
  if (!cands.length) return out;

  // Course people, to name who holds a course task and to tie a person's own task to the courses they teach / plan.
  const cIds = Array.from(new Set([...myCourseIds, ...cands.map((c) => c.courseId).filter((x): x is string => !!x)]));
  const courses = cIds.length ? await prisma.course.findMany({ where: { id: { in: cIds } }, select: { id: true, code: true, coordinatorId: true, subjectExpertId: true, instructorId: true } }) : [];
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const holderOf = (d: TaskRow): string | null => {
    if (d.assigneeId) return d.assigneeId;
    if (!d.courseId) return null;
    const c = cOf.get(d.courseId); const role = d.role || KIND_ROLE[d.kind];
    return (role === "INSTRUCTOR" ? c?.instructorId : role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.subjectExpertId) || null;
  };
  const ids = Array.from(new Set(cands.map(holderOf).filter((x): x is string => !!x)));
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));

  for (const t of open) {
    const tKey = taskKey(t)!;
    const deps = DEPENDENTS[tKey];
    const c = t.courseId ? cOf.get(t.courseId) : null;
    const coursePeople = c ? [c.instructorId, c.subjectExpertId, c.coordinatorId].filter(Boolean) : [];
    const held: Held[] = [];
    for (const d of cands) {
      if (d.id === t.id || !deps.includes(taskKey(d) || "")) continue;
      if (t.planTerm !== d.planTerm && t.planTerm && d.planTerm) continue;
      let linked = false;
      if (t.courseId) linked = d.courseId === t.courseId || (!d.courseId && (!d.assigneeId || coursePeople.includes(d.assigneeId)));
      else linked = true; // a task that is not about one course (e.g. the timetable) holds up the next task everywhere in the plan
      if (!linked) continue;
      const days = taskDays(d);
      const start = new Date(d.dueDate.getTime() - days * DAY);
      const holder = holderOf(d);
      held.push({
        id: d.id, title: d.title.replace(/ \((Fall|Spring)[^)]*\)$/i, ""), dueDate: d.dueDate, startDate: start,
        who: holder ? (holder === userId ? "You" : names.get(holder) || "—") : ROLE_LABEL[d.role || KIND_ROLE[d.kind] || ""] || "Whoever holds the role",
        course: d.courseId ? cOf.get(d.courseId)?.code || null : null, mineToo: holder === userId,
        squeezed: t.dueDate.getTime() > start.getTime(),
      });
    }
    if (!held.length) continue;
    held.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const tEnd = t.dueDate.getTime() + DAY - 1;
    if (now.getTime() > tEnd) out.set(t.id, { taskId: t.id, severity: "now", held });
    else if (tEnd - now.getTime() <= 3 * DAY) out.set(t.id, { taskId: t.id, severity: "soon", held });
  }
  return out;
}
