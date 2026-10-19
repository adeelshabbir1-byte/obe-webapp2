import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { academicRules } from "./academicRules";
import { bestAttemptTotals } from "./cgpaMath";
import { planLock } from "./registrationRules";

// Automatic registration: every active student is registered in all the courses offered to their batch this term.
// A student whose CGPA is below the hold limit is not — unless their advisor has locked a plan for them, in which
// case the plan's courses for this semester are registered. Held students wait on the advisor's list; the advisor
// chooses their courses. A course the student withdrew from is never re-added.

const adb = prisma as unknown as Record<string, any>;
export type Hold = { id: string; studentId: string; batchId: string; term: string; cgpa: number; status: string; advisorId: string | null; createdAt: Date; decidedAt: Date | null; note: string | null };

export async function runAutoRegistration(chairmanId: string, opts: { batchIds?: string[] } = {}) {
  const rules = await academicRules(chairmanId);
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((l) => l.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat("none") }, ...(opts.batchIds ? { id: { in: opts.batchIds } } : {}) }, select: { id: true, advisorId: true, degreeProgram: true, batchName: true } });
  let registered = 0, held = 0, fromPlan = 0;
  const advisorNews = new Map<string, number>();
  for (const b of batches) {
    const courses = await prisma.course.findMany({ where: { batchId: b.id, isOffered: true }, select: { id: true, offeredTermName: true, offeredTermYear: true } });
    if (!courses.length) continue;
    const term = `${courses[0].offeredTermName || ""} ${courses[0].offeredTermYear || ""}`.trim();
    const students = await prisma.student.findMany({ where: { batchId: b.id, status: "ACTIVE" }, select: { id: true, currentSemesterNumber: true } });
    const ids = students.map((s) => s.id).concat("none");
    const [have, recs, holds] = await Promise.all([
      prisma.studentEnrollment.findMany({ where: { studentId: { in: ids }, courseId: { in: courses.map((c) => c.id) } }, select: { studentId: true, courseId: true } }),
      prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, courseCode: true, creditHours: true, gpaPoints: true, grade: true } }),
      adb.registrationHold.findMany({ where: { batchId: b.id, term } }).catch(() => []) as Promise<Hold[]>,
    ]);
    const enrolled = new Set(have.map((e) => `${e.studentId}|${e.courseId}`));
    const anyEnrolled = new Set(have.map((e) => e.studentId));
    const holdOf = new Map(holds.map((h) => [h.studentId, h]));
    for (const s of students) {
      const h = holdOf.get(s.id);
      if (h && h.status === "PENDING") continue; // waiting on the advisor
      if (h && h.status === "DECIDED") continue; // the advisor chose; never second-guess
      const mine = recs.filter((r) => r.studentId === s.id);
      const t = bestAttemptTotals(mine as never);
      const cgpa = t.credits ? t.points / t.credits : null;
      if (cgpa !== null && cgpa < rules.holdCgpa && !anyEnrolled.has(s.id)) {
        // An advisor-locked plan registers itself; otherwise hold.
        const lock = await planLock(s.id);
        const plan = lock ? await prisma.degreePlanEntry.findMany({ where: { studentId: s.id, plannedSemesterNumber: s.currentSemesterNumber, course: { isOffered: true } }, select: { courseId: true } }) : [];
        if (lock && plan.length) {
          await prisma.studentEnrollment.createMany({ data: plan.map((p) => ({ studentId: s.id, courseId: p.courseId })), skipDuplicates: true });
          fromPlan++; registered += plan.length;
          continue;
        }
        await adb.registrationHold.create({ data: { id: randomUUID(), studentId: s.id, batchId: b.id, term, cgpa: Math.round(cgpa * 100) / 100, status: "PENDING", advisorId: b.advisorId, createdAt: new Date() } }).catch(() => null);
        held++;
        if (b.advisorId) advisorNews.set(b.advisorId, (advisorNews.get(b.advisorId) || 0) + 1);
        continue;
      }
      const missing = courses.filter((c) => !enrolled.has(`${s.id}|${c.id}`));
      if (!missing.length) continue;
      // Withdrawn rows already exist (unique per student/course), so createMany skips them.
      const r = await prisma.studentEnrollment.createMany({ data: missing.map((c) => ({ studentId: s.id, courseId: c.id })), skipDuplicates: true });
      registered += r.count;
    }
  }
  for (const [adv, n] of Array.from(advisorNews.entries())) await notifyUsers([adv], { kind: "ADVISING", title: `${n} student(s) wait for you to choose their courses`, body: "Their CGPA is below the registration limit, so they were not registered automatically.", href: "/advisor/registration-holds" });
  return { registered, held, fromPlan };
}

export async function holdsFor(where: Record<string, unknown>): Promise<Hold[] | null> {
  try { return await adb.registrationHold.findMany({ where, orderBy: { createdAt: "asc" } }); } catch { return null; }
}

/** The advisor registers a held student in the chosen courses. */
export async function decideHold(holdId: string, courseIds: string[], by: { id: string; name: string }, note: string | null) {
  const h = (await adb.registrationHold.findUnique({ where: { id: holdId } })) as Hold | null;
  if (!h) throw new Error("Not found.");
  if (courseIds.length) await prisma.studentEnrollment.createMany({ data: courseIds.map((courseId) => ({ studentId: h.studentId, courseId })), skipDuplicates: true });
  await adb.registrationHold.update({ where: { id: holdId }, data: { status: "DECIDED", decidedAt: new Date(), decidedById: by.id, note, coursesJson: JSON.stringify(courseIds) } });
  return h;
}

/** Courses an advisor can choose from for a held student: the batch's offered courses plus offered repeats of failed ones. */
export async function choicesFor(studentId: string, batchId: string) {
  const [own, recs] = await Promise.all([
    prisma.course.findMany({ where: { batchId, isOffered: true }, select: { id: true, code: true, title: true, creditHours: true, courseType: true } }),
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, grade: true } }),
  ]);
  const passed = new Set(recs.filter((r) => !/^F/i.test(r.grade)).map((r) => r.courseCode.toUpperCase()));
  const failed = Array.from(new Set(recs.filter((r) => /^F/i.test(r.grade) && !passed.has(r.courseCode.toUpperCase())).map((r) => r.courseCode)));
  const repeats = failed.length ? await prisma.course.findMany({ where: { code: { in: failed }, isOffered: true, NOT: { batchId } }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, batch: { select: { batchName: true } } } }) : [];
  return { own, repeats, failed };
}

/** Reminders: holds waiting more than 3 days (daily cron). */
export async function remindHolds() {
  const old = (await adb.registrationHold.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 3 * 864e5) } } }).catch(() => [])) as Hold[];
  const by = new Map<string, number>();
  for (const h of old) if (h.advisorId) by.set(h.advisorId, (by.get(h.advisorId) || 0) + 1);
  for (const [adv, n] of Array.from(by.entries())) await notifyUsers([adv], { kind: "ADVISING", title: `Reminder: ${n} held student(s) still not registered`, href: "/advisor/registration-holds" });
  return old.length;
}
