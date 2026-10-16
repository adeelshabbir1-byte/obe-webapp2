import { prisma } from "./db";
import { leadsInScope } from "./readinessScope";
import { workCourses } from "./deadlines";
import { seProgressFor } from "./seProgress";
import { analyzeTeaching } from "./teachingAnalysis";
import { termLabel, courseTermIndex, currentTermIndexFor } from "./courseTerm";

// The Institute Head's risk register: every program on one screen, with what could go wrong this term and next —
// courses nobody owns, plans not ready, overdue work, results stuck, PLOs below target, teaching that doesn't match the plan.
// Each risk has a severity, the program, a plain sentence and the page where it is fixed.

export type Severity = "high" | "medium" | "low";
export type Risk = { severity: Severity; program: string; area: string; text: string; href: string; count: number };
export type ProgramRow = {
  id: string; program: string; department: string | null; score: number;
  noSe: number; seWaiting: number; plansNotReady: number; plansBelowOmc: number; noInstructor: number;
  overdue: number; resultsPending: number; gradeChanges: number; teachingFlags: number; ploLow: string[]; attendanceStale: number; attendanceShort: number;
};
type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
const db = prisma as unknown as Record<string, any>;
const SEV_POINTS: Record<Severity, number> = { high: 10, medium: 4, low: 1 };

async function safe<T>(f: () => Promise<T>, d: T): Promise<T> { try { return await f(); } catch { return d; } }

export async function riskRegister(user: Who, opts: { teaching?: boolean } = {}) {
  const { leads } = await leadsInScope(user);
  const leadIds = leads.map((l) => l.id);
  const name = new Map(leads.map((l) => [l.id, l.leadProgram || l.name]));
  const dept = new Map(leads.map((l) => [l.id, l.department_?.name || null]));
  const courses = leadIds.length ? await workCourses({ coordinatorId: { in: leadIds } }) : [];
  // Courses of this term and the next that have nobody at all yet (not offered, no expert, no instructor) — the plan for
  // them has to be written now, so they belong on the register too.
  const unowned = leadIds.length ? await prisma.course.findMany({
    where: { coordinatorId: { in: leadIds }, subjectExpertId: null, instructorId: null, isOffered: false },
    select: { id: true, code: true, title: true, coordinatorId: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batch: { select: { startTerm: true, startYear: true } } },
    take: 5000,
  }) : [];
  const cur = new Map<string, number | null>();
  for (const id of leadIds) cur.set(id, await currentTermIndexFor(id));
  for (const c of unowned) {
    const t = courseTermIndex(c), now0 = cur.get(c.coordinatorId) ?? null;
    if (t === null || now0 === null || t < now0 || t > now0 + 1) continue;
    courses.push({ id: c.id, code: c.code, title: c.title, coordinatorId: c.coordinatorId, subjectExpertId: null, instructorId: null, isOffered: false, term: t, past: false });
  }
  const ids = courses.map((c) => c.id);
  const offered = courses.filter((c) => c.isOffered);
  const now = new Date();

  const [full, progress, overdueRows, results, changes, attendance] = await Promise.all([
    ids.length ? prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true, courseType: true, coordinatorId: true, templateStatus: true, seResponse: true, seResponseNote: true, subjectExpertId: true, instructorId: true } }) : Promise.resolve([]),
    Promise.resolve(new Map<string, { done: boolean }[]>()),
    ids.length ? prisma.deadline.findMany({ where: { courseId: { in: ids }, completedAt: null, allCourses: false, dueDate: { lt: now } } as never, select: { courseId: true, title: true } }) : Promise.resolve([]),
    safe(() => db.courseResult.findMany({ where: { courseId: { in: offered.map((c) => c.id) } } }) as Promise<{ courseId: string; status: string }[]>, []),
    safe(() => db.gradeChangeRequest.findMany({ where: { courseId: { in: offered.map((c) => c.id) }, status: "PENDING" } }) as Promise<{ courseId: string }[]>, []),
    offered.length ? prisma.attendanceRecord.groupBy({ by: ["courseId"], where: { courseId: { in: offered.map((c) => c.id) } }, _max: { updatedAt: true } } as never) as unknown as Promise<{ courseId: string; _max: { updatedAt: Date | null } }[]> : Promise.resolve([]),
  ]);
  // seProgressFor needs the real course type / status for the OMC minimums — recompute with them.
  const fullOf = new Map(full.map((c) => [c.id, c]));
  const prog = await seProgressFor(full.filter((c) => c.subjectExpertId).map((c) => ({ id: c.id, courseType: c.courseType, coordinatorId: c.coordinatorId, templateStatus: c.templateStatus }))).catch(() => progress);
  const resultOf = new Map(results.map((r) => [r.courseId, r.status]));
  const lastAtt = new Map(attendance.map((a) => [a.courseId, a._max.updatedAt]));
  // Students below the minimum attendance, from the shortage flags kept up to date as attendance is marked.
  const shortFlags = offered.length ? await prisma.attendanceFlag.groupBy({ by: ["courseId"], where: { courseId: { in: offered.map((c) => c.id) }, status: "SHORT" }, _count: { _all: true } }).catch(() => []) : [];
  const shortOf = new Map(shortFlags.map((f) => [f.courseId, f._count._all]));
  const staleCut = new Date(now.getTime() - 14 * 864e5);

  // Teaching vs plan (Planned vs Taught): only courses with lectures logged; capped so the page stays quick.
  const teach = new Map<string, { flags: number; instructorId: string | null; missed: number }>();
  if (opts.teaching !== false) {
    const logged = offered.length ? await prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: offered.map((c) => c.id) }, source: "INSTRUCTOR", actualDate: { not: null } }, _count: { _all: true } } as never) as unknown as { courseId: string; _count: { _all: number } }[] : [];
    const pick = logged.filter((l) => l._count._all >= 5).slice(0, 120).map((l) => l.courseId);
    for (let i = 0; i < pick.length; i += 8) {
      await Promise.all(pick.slice(i, i + 8).map(async (id) => {
        const a = await analyzeTeaching(id).catch(() => null);
        if (!a) return;
        const flags = a.topics.filter((t) => t.insFlags.some((f) => f.kind === "under" || f.kind === "unassessed")).length;
        teach.set(id, { flags, instructorId: fullOf.get(id)?.instructorId || null, missed: a.topics.filter((t) => t.status === "missed").length });
      }));
    }
  }

  // PLO attainment from the latest snapshot term of each program: share of student-course records that passed each PLO.
  const ploLow = new Map<string, string[]>();
  const records = leadIds.length ? await prisma.studentTranscriptRecord.findMany({ where: { coordinatorId: { in: leadIds } }, select: { coordinatorId: true, termName: true, termYear: true, ploAttainmentJson: true }, orderBy: [{ termYear: "desc" }], take: 20000 }) : [];
  for (const id of leadIds) {
    const mine = records.filter((r) => r.coordinatorId === id);
    if (!mine.length) continue;
    const latest = mine.reduce((m, r) => Math.max(m, r.termYear * 2 + (r.termName === "Fall" ? 1 : 0)), 0);
    const agg = new Map<string, { n: number; ok: number }>();
    for (const r of mine.filter((x) => x.termYear * 2 + (x.termName === "Fall" ? 1 : 0) === latest)) {
      let arr: { label: string; passed: boolean }[] = [];
      try { arr = JSON.parse(r.ploAttainmentJson || "[]"); } catch { arr = []; }
      for (const p of arr) { const e = agg.get(p.label) || { n: 0, ok: 0 }; e.n++; if (p.passed) e.ok++; agg.set(p.label, e); }
    }
    ploLow.set(id, Array.from(agg.entries()).filter(([, e]) => e.n >= 10 && e.ok / e.n < 0.6).map(([l, e]) => `${l} ${Math.round((100 * e.ok) / e.n)}%`));
  }

  const risks: Risk[] = [];
  const rows: ProgramRow[] = leads.map((l) => {
    const cs = courses.filter((c) => c.coordinatorId === l.id);
    const p = name.get(l.id)!;
    const terms = (list: typeof cs) => Array.from(new Set(list.map((c) => (c.term !== null ? termLabel(c.term) : "")).filter(Boolean))).join(", ");
    const nowT = cur.get(l.id) ?? null;
    const noSe = cs.filter((c) => !c.subjectExpertId && (c.isOffered || (c.term !== null && nowT !== null && c.term <= nowT + 1)));
    const seWaiting = cs.filter((c) => fullOf.get(c.id)?.seResponse === "PENDING" && c.subjectExpertId);
    const declined = cs.filter((c) => fullOf.get(c.id)?.seResponse === "DECLINED" && !c.subjectExpertId);
    const notReady = cs.filter((c) => c.subjectExpertId && ["draft", "changes-requested", "reopened"].includes(fullOf.get(c.id)?.templateStatus || ""));
    const belowOmc = cs.filter((c) => { const st = prog.get(c.id); return st && st[0]?.done && (!st[1]?.done || !st[3]?.done); });
    const off = cs.filter((c) => c.isOffered);
    const noInstr = off.filter((c) => !c.instructorId);
    const overdue = overdueRows.filter((d) => cs.some((c) => c.id === d.courseId));
    const resultsPending = off.filter((c) => resultOf.get(c.id) === "SUBMITTED");
    const returned = off.filter((c) => resultOf.get(c.id) === "RETURNED");
    const gc = changes.filter((g) => cs.some((c) => c.id === g.courseId));
    const flagged = off.filter((c) => (teach.get(c.id)?.flags || 0) >= 2 || (teach.get(c.id)?.missed || 0) >= 2);
    const stale = off.filter((c) => c.instructorId && (!lastAtt.get(c.id) || lastAtt.get(c.id)! < staleCut));
    const low = ploLow.get(l.id) || [];
    const shortCourses = off.filter((c) => (shortOf.get(c.id) || 0) > 0);
    const shortStudents = shortCourses.reduce((n, c) => n + (shortOf.get(c.id) || 0), 0);
    const add = (severity: Severity, area: string, text: string, href: string, count: number) => { if (count > 0) risks.push({ severity, program: p, area, text, href, count }); };
    add("high", "Ownership", `${noSe.length} course(s) of ${terms(noSe) || "this or a coming term"} have no Subject Expert: ${noSe.slice(0, 6).map((c) => c.code).join(", ")}${noSe.length > 6 ? "…" : ""}.`, "/coordinator/assign-subject-experts", noSe.length);
    add("high", "Ownership", `${declined.length} course(s) were declined by the Subject Expert and need someone else: ${declined.map((c) => c.code).join(", ")}.`, "/coordinator/assign-subject-experts", declined.length);
    add("high", "Teaching", `${noInstr.length} offered course(s) have no instructor: ${noInstr.slice(0, 6).map((c) => c.code).join(", ")}${noInstr.length > 6 ? "…" : ""}.`, "/coordinator/courses", noInstr.length);
    add("medium", "Ownership", `${seWaiting.length} Subject Expert assignment(s) not yet accepted.`, "/coordinator/assign-subject-experts", seWaiting.length);
    add(overdue.length > 5 ? "high" : "medium", "Deadlines", `${overdue.length} course deadline(s) are overdue (e.g. ${overdue.slice(0, 2).map((d) => d.title.replace(/ \((Fall|Spring)[^)]*\)$/i, "")).join("; ")}).`, "/deadlines", overdue.length);
    add("medium", "Course plans", `${notReady.length} course plan(s) not submitted to the OMC yet.`, "/omc/queue", notReady.length);
    add("medium", "Course plans", `${belowOmc.length} course plan(s) are below the OMC's minimums (topics per CLO/PLO or PLO assessment).`, "/omc/queue", belowOmc.length);
    add("medium", "Results", `${resultsPending.length} course result(s) waiting for approval.`, "/results-approval", resultsPending.length);
    add("medium", "Results", `${returned.length} result(s) were returned to the instructor and not resubmitted.`, "/results-approval", returned.length);
    add("low", "Results", `${gc.length} grade change request(s) waiting.`, "/results-approval", gc.length);
    add("medium", "Teaching quality", `${flagged.length} course(s) where teaching time and assessment don't match or planned topics were dropped: ${flagged.slice(0, 5).map((c) => c.code).join(", ")}.`, "/omc/reports/planned-vs-taught", flagged.length);
    add("high", "Outcomes", `PLOs attained by fewer than 60% of students last term: ${low.join(", ")}.`, "/omc/reports/attainment-analytics", low.length);
    add("low", "Attendance", `${stale.length} course(s) have no attendance marked in the last 14 days.`, "/omc/delivery-completion", stale.length);
    add(shortStudents >= 10 ? "high" : "medium", "Attendance", `${shortStudents} attendance shortage(s) below the minimum in ${shortCourses.length} course(s): ${shortCourses.slice(0, 5).map((c) => c.code).join(", ")}${shortCourses.length > 5 ? "…" : ""}.`, "/coordinator/attendance", shortStudents);
    const mine = risks.filter((r) => r.program === p);
    return {
      id: l.id, program: p, department: dept.get(l.id) || null, score: mine.reduce((n, r) => n + SEV_POINTS[r.severity] * Math.min(5, r.count), 0),
      noSe: noSe.length + declined.length, seWaiting: seWaiting.length, plansNotReady: notReady.length, plansBelowOmc: belowOmc.length, noInstructor: noInstr.length,
      overdue: overdue.length, resultsPending: resultsPending.length + returned.length, gradeChanges: gc.length, teachingFlags: flagged.length, ploLow: low, attendanceStale: stale.length, attendanceShort: shortStudents,
    };
  });
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  rows.sort((a, b) => b.score - a.score);
  // Teachers whose courses are flagged in more than one place.
  const teacherFlags = new Map<string, string[]>();
  for (const [id, t] of Array.from(teach.entries())) if (t.instructorId && (t.flags >= 2 || t.missed >= 2)) teacherFlags.set(t.instructorId, [...(teacherFlags.get(t.instructorId) || []), fullOf.get(id)?.code || ""]);
  const tIds = Array.from(teacherFlags.keys());
  const tNames = new Map((tIds.length ? await prisma.user.findMany({ where: { id: { in: tIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const teachers = tIds.map((id) => ({ id, name: tNames.get(id) || "—", courses: teacherFlags.get(id)! })).sort((a, b) => b.courses.length - a.courses.length);
  return { rows, risks, teachers, analysed: teach.size };
}
