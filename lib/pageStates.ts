import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { fromCounts, type PageState } from "./pageStatesCore";

// The page checks behind green / grey card colours (queue item 9). Cheap counts only, worked out at most every 5 minutes
// per person. "This term" = the courses offered now.
const db = prisma as unknown as Record<string, any>;
type U = { id: string; role: string; managedById?: string | null; departmentId?: string | null };
const cache = new Map<string, { at: number; v: Record<string, PageState> }>();
const TTL = 300_000;

async function courseChecks(courseIds: string[]) {
  if (!courseIds.length) return { total: 0, planned: 0 };
  const [clos, rows, insts] = await Promise.all([
    prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    prisma.assessmentInstrument.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
  ]);
  const has = (g: { courseId: string }[]) => new Set(g.map((x) => x.courseId));
  const C = has(clos as never), R = has(rows as never), I = has(insts as never);
  return { total: courseIds.length, planned: courseIds.filter((id) => C.has(id) && R.has(id) && I.has(id)).length };
}

export async function pageStates(user: U): Promise<Record<string, PageState>> {
  const c = cache.get(user.id);
  if (c && Date.now() - c.at < TTL) return c.v;
  const out: Record<string, PageState> = {};
  try {
    if (["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) {
      const mine = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: user.id }, { subjectExpertId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }] }, select: { id: true } });
      const ids = mine.map((x) => x.id);
      const k = await courseChecks(ids);
      const st = fromCounts(k.total, k.planned, "courses with CLOs, a lecture plan and assessments", "still need CLOs, a lecture plan or assessments");
      out[user.role === "SUBJECT_EXPERT" ? "/subjectexpert/courses" : "/instructor/courses"] = st;
      if (ids.length) {
        const since = new Date(Date.now() - 150 * 864e5);
        const papers = ((await db.qbPaper?.findMany({ where: { courseId: { in: ids }, status: "ADOPTED", createdAt: { gte: since } }, select: { courseId: true } }).catch(() => [])) || []) as { courseId: string }[];
        const withPaper = new Set(papers.map((p) => p.courseId)).size;
        out["/plan-generate"] = withPaper === 0 ? { status: "blue", reason: "No assessment generated from the plan yet this term" } : fromCounts(ids.length, withPaper, "courses with generated assessments", "have no adopted assessment yet");
      } else out["/plan-generate"] = { status: "grey", reason: "Not set up yet — no course this term" };
    }
    if (["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "OMC", "DEAN"].includes(user.role)) {
      const cid = await chairmanIdFor(user as never);
      const scope = user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: cid } };
      const offered = (await prisma.course.findMany({ where: { ...scope, isOffered: true }, select: { id: true }, take: 3000 })).map((x) => x.id);
      const k = await courseChecks(offered);
      out["/coordinator/semester"] = fromCounts(k.total, k.planned, "courses this term planned", "still need CLOs, a plan or assessments");
      const students = await prisma.student.count({ where: { batch: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: cid } } } });
      out["/data-import"] = students ? { status: "green", reason: `✓ ${students} students on record` } : { status: "grey", reason: "Not set up yet — no students imported" };
      const unplanned = await prisma.course.count({ where: { ...scope, isOffered: false, lectureRows: { none: {} }, studentMarks: { none: {} } } }).catch(() => 0);
      out["/term-rollover"] = unplanned ? { status: "amber", reason: `${unplanned} course(s) without a plan — roll over in one click` } : { status: "green", reason: "✓ Every course has a plan" };
      if (["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) {
        const { setupChecks } = await import("./setupCheck");
        const ck = await setupChecks(cid).catch(() => []);
        const miss = ck.filter((x) => !x.ok);
        out["/setup-check"] = !ck.length ? { status: "grey", reason: "Not checked yet" } : miss.length ? { status: "amber", reason: `${miss.length} thing(s) still to set up: ${miss.slice(0, 2).map((m) => m.label).join("; ")}` } : { status: "green", reason: "✓ Everything is set up" };
        if (user.role === "CHAIRMAN") out["/chairman/setup"] = out["/setup-check"];
      }
    }
  } catch { /* a check that fails leaves the card plain */ }
  cache.set(user.id, { at: Date.now(), v: out });
  return out;
}
