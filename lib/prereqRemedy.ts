import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chainFor, numberSetting } from "./scopedSettings";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";

// Weak prerequisite topic → remedy before the dependent topic is taught (Adeel prompt §26) and smarter CQI (§27).
// After marks: if the class did badly on a topic A (average < X% or more than Y% below the pass mark) and A is a
// prerequisite of a topic B not taught yet, the teacher must choose a remedy (re-teach / tutorial / practice + re-quiz)
// within N working days; a strong link blocks "lecture B held" until then (the PL can excuse). Weak links only suggest.
// A link to a later course warns that course's teacher when it is offered to the batch. Weak twice → the OMC's agenda.
const db = prisma as unknown as Record<string, any>;
export const KEYS = { avg: "cqi.weakAvg", below: "cqi.weakBelowPct", days: "cqi.remedyDays" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const addWorkDays = (d: Date, n: number) => { const x = new Date(d); while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6) n--; } return x; };

export async function onMarks(courseId: string, instrumentId: string) {
  if (!db.prereqRemedy) return 0;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, batchId: true, instructorId: true, coordinatorId: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { id: true, role: true, managedById: true, departmentId: true } } } });
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId }, select: { label: true, maxScore: true } });
  if (!course || !inst) return 0;
  const chain = await chainFor(course.coordinator as never);
  const [X, Y, N] = await Promise.all([numberSetting(chain, KEYS.avg, 50), numberSetting(chain, KEYS.below, 40), numberSetting(chain, KEYS.days, 5)]);
  const marks = await prisma.studentMark.findMany({ where: { instrumentId }, select: { studentId: true, score: true } });
  if (marks.length < 5) return 0;
  const pct = marks.map((m) => (100 * m.score) / (inst.maxScore || 1));
  const avg = pct.reduce((a, b) => a + b, 0) / pct.length, weakIds = marks.filter((m, i) => pct[i] < 50).map((m) => m.studentId);
  const belowPct = (100 * weakIds.length) / marks.length;
  if (avg >= X && belowPct <= Y) return 0;
  const covered = await prisma.lectureRowInstrument.findMany({ where: { instrumentId }, select: { lectureRow: { select: { topic: true, bloomLevel: true } } } });
  if (!covered.length) return 0;
  const deps = await prisma.topicPrerequisite.findMany({ where: { chairmanId: chain.chairmanId, prereqCourseCode: { equals: course.code, mode: "insensitive" }, orphanedAt: null } });
  const warn = await db.itemWarning?.findFirst({ where: { instrumentId }, select: { diagnosis: true } }).catch(() => null);
  let made = 0;
  for (const cv of covered) {
    for (const d of deps.filter((x) => norm(x.prereqTopic) === norm(cv.lectureRow.topic))) {
      const same = d.dependentCourseCode.toUpperCase() === course.code.toUpperCase();
      const exists = await db.prereqRemedy.findFirst({ where: { courseId, instrumentId, prereqTopic: d.prereqTopic, dependentTopic: d.dependentTopic } });
      if (exists) continue;
      let lectureId: string | null = null;
      if (same) {
        const rows = await prisma.lectureRow.findMany({ where: { courseId, topic: { equals: d.dependentTopic, mode: "insensitive" } }, select: { id: true, source: true } });
        const row = rows.find((r) => r.source === "INSTRUCTOR") || rows[0];
        if (!row) continue;
        if ((await prisma.attendanceRecord.count({ where: { lectureRowId: row.id } })) > 0) continue; // already taught
        lectureId = row.id;
      }
      const high = /^C[3-6]/i.test(cv.lectureRow.bloomLevel || "");
      const cause = [warn?.diagnosis, high ? "A higher-level (apply / analyse) item — a worked-examples tutorial fits best." : "A recall / understand item — a quick revision fits best."].filter(Boolean).join(" ");
      await db.prereqRemedy.create({ data: { id: randomUUID(), chairmanId: chain.chairmanId, courseId, instrumentId, prereqTopic: d.prereqTopic, dependentCourseCode: d.dependentCourseCode, dependentTopic: d.dependentTopic, dependentLectureId: lectureId, strength: d.strength || "STRONG", avg: Math.round(avg), belowPct: Math.round(belowPct), cause, weakStudentsJson: JSON.stringify(weakIds), status: !same ? "CROSS" : /weak/i.test(d.strength || "") ? "SUGGESTION" : "OPEN", dueBy: addWorkDays(new Date(), N) } });
      made++;
      const who = [course.instructorId].filter((x): x is string => !!x);
      if (same) await notifyUsers(who, { kind: "WARNING", title: `${course.code}: ${d.prereqTopic} average ${Math.round(avg)}% — needed by ${d.dependentTopic}`, body: `Choose a remedy before ${d.dependentTopic} is taught (within ${N} working days).`, href: "/cqi/remedies" }).catch(() => null);
      // Weak twice in different terms → curriculum CQI item on the OMC's agenda.
      const before = await db.prereqRemedy.count({ where: { chairmanId: chain.chairmanId, prereqTopic: d.prereqTopic, createdAt: { lt: new Date(Date.now() - 120 * 864e5) } } });
      if (before > 0) {
        const omc = await db.cmtCommittee?.findFirst({ where: { chairmanId: chain.chairmanId, type: "OMC" } }).catch(() => null);
        if (omc) await (await import("./committeeEngine")).addItem(null, omc.id, { kind: "CQI_TOPIC", title: `Recurring weak topic: ${course.code} — ${d.prereqTopic}`, summary: `Weak in ${before + 1} terms. Consider more lectures, a lab, moving it earlier or a prerequisite.`, href: "/cqi/remedies" } as never).catch(() => null);
      }
    }
  }
  if (made) await sectionCompare(course.code, inst.label, courseId, avg, chain.chairmanId, course.coordinatorId).catch(() => null);
  return made;
}

/** One section weak while the other sections of the same course are fine → a quiet flag to the PL only (§27.9). */
async function sectionCompare(code: string, label: string, courseId: string, avg: number, chairmanId: string, plId: string) {
  const others = await prisma.assessmentInstrument.findMany({ where: { label, course: { code, isOffered: true, NOT: { id: courseId }, coordinator: { managedById: chairmanId } } }, select: { id: true, maxScore: true } });
  if (!others.length) return;
  const all = await prisma.studentMark.findMany({ where: { instrumentId: { in: others.map((o) => o.id) } }, select: { instrumentId: true, score: true } });
  if (!all.length) return;
  const oAvg = all.reduce((a, m) => a + (100 * m.score) / (others.find((o) => o.id === m.instrumentId)?.maxScore || 1), 0) / all.length;
  if (oAvg - avg >= 15) await notifyUsers([plId], { kind: "WARNING", title: `${code} ${label}: one section ${Math.round(avg)}% vs ${Math.round(oAvg)}% in the others`, body: "Likely a teaching issue rather than the topic — consider a mentor or a peer class observation. Not shown to students.", href: "/cqi/remedies" }).catch(() => null);
}

/** The gate: a strong-link remedy not chosen yet blocks marking the dependent lecture held. */
export async function remedyGate(lectureRowId: string) {
  const r = await db.prereqRemedy?.findFirst({ where: { dependentLectureId: lectureRowId, status: "OPEN" } }).catch(() => null);
  return r ? `Choose a remedy for the weak prerequisite “${r.prereqTopic}” (average ${r.avg}%) before teaching “${r.dependentTopic}” — or ask the Program Lead to excuse it (CQI remedies).` : null;
}

export async function choose(user: { id: string }, id: string, remedy: string, note: string) {
  const r = await db.prereqRemedy.findUnique({ where: { id } });
  const c = r ? await prisma.course.findUnique({ where: { id: r.courseId }, select: { instructorId: true, sectionAssignments: { select: { instructorId: true } } } }) : null;
  if (!r || !c || (c.instructorId !== user.id && !c.sectionAssignments.some((a) => a.instructorId === user.id))) throw new Error("Not your course.");
  if (!["RETEACH", "TUTORIAL", "PRACTICE"].includes(remedy)) throw new Error("Choose re-teach, tutorial or practice + re-quiz.");
  await db.prereqRemedy.update({ where: { id }, data: { status: "CHOSEN", remedy, remedyNote: note.slice(0, 300) || null, chosenById: user.id, chosenAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "REMEDY_CHOSEN", entityType: "Course", entityId: r.courseId, metadata: { remedy, topic: r.prereqTopic } }).catch(() => null);
}
/** Close the loop with the re-check result: effective at or above the threshold, else the next step is offered. */
export async function closeWith(user: { id: string }, id: string, afterPct: number) {
  const r = await db.prereqRemedy.findUnique({ where: { id } });
  if (!r) throw new Error("Not found.");
  const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { coordinator: { select: { id: true, role: true, managedById: true, departmentId: true } }, batchId: true } });
  const X = await numberSetting(await chainFor(c!.coordinator as never), KEYS.avg, 50);
  const ok = afterPct >= X;
  await db.prereqRemedy.update({ where: { id }, data: { status: ok ? "EFFECTIVE" : "NEEDS_MORE", afterPct } });
  await prisma.cqiRecord.create({ data: { chairmanId: r.chairmanId, authorId: user.id, batchId: c?.batchId || null, courseId: r.courseId, finding: `Weak prerequisite topic “${r.prereqTopic}” (average ${r.avg}%, ${r.belowPct}% below the pass mark) before “${r.dependentTopic}”.`, actionTaken: `${r.remedy || "Remedy"}${r.remedyNote ? `: ${r.remedyNote}` : ""}`, status: ok ? "CLOSED" : "OPEN", sourceType: "PREREQ_REMEDY", sourceReference: r.id, metricBefore: r.avg, metricAfter: afterPct } as never }).catch(() => null);
  return ok;
}
export async function excuse(user: { id: string }, id: string, reason: string) {
  if (reason.trim().length < 5) throw new Error("Give the reason.");
  await db.prereqRemedy.update({ where: { id }, data: { status: "EXCUSED", excusedById: user.id, excuseReason: reason.slice(0, 300) } });
}

/** Daily: overdue remedies go red to the PL; cross-course warnings reach the next course's teacher when it is offered. */
export async function remedyJobs(now = new Date()) {
  if (!db.prereqRemedy) return 0;
  const overdue = (await db.prereqRemedy.findMany({ where: { status: "OPEN", dueBy: { lt: now }, notifiedNextAt: null } })) as { id: string; courseId: string; prereqTopic: string; dependentTopic: string }[];
  for (const r of overdue) {
    const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true, coordinatorId: true } });
    if (c) await notifyUsers([c.coordinatorId], { kind: "WARNING", title: `${c.code}: no remedy chosen for weak “${r.prereqTopic}”`, body: `“${r.dependentTopic}” is blocked until a remedy is chosen or you excuse it.`, href: "/cqi/remedies" }).catch(() => null);
    await db.prereqRemedy.update({ where: { id: r.id }, data: { notifiedNextAt: now } });
  }
  const cross = (await db.prereqRemedy.findMany({ where: { status: "CROSS", notifiedNextAt: null } })) as { id: string; courseId: string; prereqTopic: string; dependentCourseCode: string; dependentTopic: string; avg: number }[];
  for (const r of cross) {
    const src = await prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true, batchId: true } });
    const next = src?.batchId ? await prisma.course.findFirst({ where: { batchId: src.batchId, code: { equals: r.dependentCourseCode, mode: "insensitive" }, isOffered: true }, select: { instructorId: true, code: true } }) : null;
    if (next?.instructorId) {
      await notifyUsers([next.instructorId], { kind: "WARNING", title: `${next.code}: this batch was weak in ${src?.code} “${r.prereqTopic}” (${r.avg}%)`, body: `It is needed for “${r.dependentTopic}” — revise it in week 1.`, href: "/cqi/remedies" }).catch(() => null);
      await db.prereqRemedy.update({ where: { id: r.id }, data: { notifiedNextAt: now } });
    }
  }
  return overdue.length;
}
