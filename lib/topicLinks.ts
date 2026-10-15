import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { omcCourseScope } from "./omcScope";
import { getPassingCriteria } from "./passingCriteria";
import { analyzeTeaching, isExamTopic, norm, similarity } from "./teachingAnalysis";
import { holdersOf, notifyUsers } from "./notifications";

// Topic-level prerequisites and what follows from them.
//
// A link says "topic X of course A is needed for topic Y of course B" (e.g. Functions in Programming Fundamentals ->
// Methods in OOP). Links are kept per program (the Program Lead who owns both courses) by course code and topic
// text, so they apply to every batch's copy of the two courses. From the links the system:
//  - checks that the prerequisite topics are actually assessed in course A,
//  - checks, when A and B run in the same semester for the same students, that A reaches X before B reaches Y,
//  - after results, finds topics most students did not master (or that were never taught) and raises follow-ups
//    to the teacher of B (and to whoever teaches A next time), who records what was done about it (CQI).

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
type Src = "SE" | "INSTRUCTOR";

/** Two topics are the same when their wording matches closely (lecture plans get re-typed between batches). */
export function sameTopic(a: string, b: string) {
  return norm(a) === norm(b) || similarity(a, b) >= 0.6;
}
/** Best matching lecture rows of a plan for a topic. */
export function rowsForTopic<T extends { topic: string }>(rows: T[], topic: string): T[] {
  const exact = rows.filter((r) => norm(r.topic) === norm(topic));
  if (exact.length) return exact;
  let best = 0;
  for (const r of rows) best = Math.max(best, similarity(r.topic, topic));
  return best >= 0.6 ? rows.filter((r) => similarity(r.topic, topic) === best) : [];
}

/** The lecture plan of a course as its topics: the Subject Expert's plan, or the Instructor's copy when asked (or when there is no plan). */
export async function courseTopics(courseId: string, source: Src = "SE") {
  const pick = async (s: Src) => prisma.lectureRow.findMany({ where: { courseId, source: s, topic: { not: "" } }, select: { id: true, topic: true, subtopic: true, lectureNumber: true, week: true, actualDate: true }, orderBy: { lectureNumber: "asc" } });
  let rows = await pick(source);
  if (!rows.length && source === "SE") rows = await pick("INSTRUCTOR");
  return rows.filter((r) => !isExamTopic(r.topic));
}

/** May this person add or remove topic links between these two courses? (Their Subject Expert, the Program Lead, the OMC.) */
export async function canEditLinks(user: Who, a: { coordinatorId: string; subjectExpertId: string | null; id: string }, b: { coordinatorId: string; subjectExpertId: string | null; id: string }) {
  if (a.coordinatorId !== b.coordinatorId) return false;
  if (user.role === "PROGRAM_COORDINATOR") return a.coordinatorId === user.id;
  if (user.role === "SUBJECT_EXPERT") return a.subjectExpertId === user.id || b.subjectExpertId === user.id;
  if (user.role === "OMC") {
    const n = await prisma.course.count({ where: { id: { in: [a.id, b.id] }, coordinator: { managedById: user.managedById || "" }, ...omcCourseScope(user) } });
    return n > 0;
  }
  return false;
}

/** Courses this person may look at in the prerequisite-topic view. */
export async function visibleCourses(user: Who) {
  const select = { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true, batchId: true, semesterNumber: true, prerequisiteCourseId: true, isOffered: true, batch: { select: { degreeProgram: true, batchName: true } } } as const;
  if (user.role === "PROGRAM_COORDINATOR") return prisma.course.findMany({ where: { coordinatorId: user.id }, select, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  if (user.role === "OMC") return prisma.course.findMany({ where: { coordinator: { managedById: user.managedById || "" }, ...omcCourseScope(user) }, select, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  if (user.role === "SUBJECT_EXPERT" || user.role === "INSTRUCTOR") {
    // Their own courses, plus every course of the same programs (to link against).
    const mine = await prisma.course.findMany({ where: user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { instructorId: user.id }, select: { coordinatorId: true } });
    const leads = Array.from(new Set(mine.map((c) => c.coordinatorId)));
    return prisma.course.findMany({ where: { coordinatorId: { in: leads.length ? leads : ["none"] } }, select, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  }
  if (["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"].includes(user.role)) return prisma.course.findMany({ where: { coordinator: { managedById: user.managedById || "", departmentId: user.departmentId || "none" } }, select, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  if (user.role === "CHAIRMAN") return prisma.course.findMany({ where: { coordinator: { managedById: user.id } }, select, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], take: 3000 });
  return [];
}

export type LinkRow = { id: string; prereqCourseCode: string; prereqCourseTitle: string; prereqTopic: string; dependentCourseCode: string; dependentCourseTitle: string; dependentTopic: string; note: string | null; createdById: string; createdAt: Date };

/** Links that involve a course code in a program, in both directions. */
export async function linksForCode(coordinatorId: string, code: string) {
  try {
    const [asPrereq, asDependent] = await Promise.all([
      prisma.topicPrerequisite.findMany({ where: { coordinatorId, prereqCourseCode: code }, orderBy: { createdAt: "asc" } }),
      prisma.topicPrerequisite.findMany({ where: { coordinatorId, dependentCourseCode: code }, orderBy: { createdAt: "asc" } }),
    ]);
    return { asPrereq: asPrereq as LinkRow[], asDependent: asDependent as LinkRow[], missingTable: false };
  } catch {
    return { asPrereq: [] as LinkRow[], asDependent: [] as LinkRow[], missingTable: true };
  }
}

// ---------------------------------------------------------------------------
// Checks shown while planning

export type PrereqCheck = { topic: string; dependents: { code: string; title: string; topic: string }[]; lectures: number[]; assessedBy: string[] };

/** For each topic of this course that a later course depends on: is it in the plan, and is it assessed? */
export async function prereqAssessmentCheck(courseId: string, source: Src): Promise<PrereqCheck[]> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, coordinatorId: true } });
  if (!course) return [];
  const { asPrereq } = await linksForCode(course.coordinatorId, course.code);
  if (!asPrereq.length) return [];
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true, topic: true, lectureNumber: true, instrumentLinks: { select: { instrument: { select: { type: true, label: true } } } } } });
  const papers = await prisma.paperDistributionItem.findMany({ where: { courseId, source }, select: { lectureRowId: true, topicText: true, examType: true, questionNo: true } });
  const byTopic = new Map<string, PrereqCheck>();
  for (const l of asPrereq) {
    const key = norm(l.prereqTopic);
    const entry = byTopic.get(key) || { topic: l.prereqTopic, dependents: [], lectures: [], assessedBy: [] };
    entry.dependents.push({ code: l.dependentCourseCode, title: l.dependentCourseTitle, topic: l.dependentTopic });
    byTopic.set(key, entry);
  }
  for (const entry of Array.from(byTopic.values())) {
    const matched = rowsForTopic(rows, entry.topic);
    entry.lectures = matched.map((r) => r.lectureNumber).sort((a, b) => a - b);
    const ids = new Set(matched.map((r) => r.id));
    const items = new Set<string>();
    for (const r of matched) for (const k of r.instrumentLinks) items.add(`${k.instrument.type === "Midterm" || k.instrument.type === "Final" ? `${k.instrument.type} Q${k.instrument.label}` : k.instrument.label}`);
    for (const p of papers) if ((p.lectureRowId && ids.has(p.lectureRowId)) || sameTopic(p.topicText, entry.topic)) items.add(`${p.examType || "Paper"} Q${p.questionNo}`);
    entry.assessedBy = Array.from(items);
  }
  return Array.from(byTopic.values());
}

export type OrderIssue = { prereqCode: string; prereqTopic: string; prereqWeek: number; dependentCode: string; dependentTopic: string; dependentWeek: number; thisSide: "prereq" | "dependent"; otherCourseId: string };

/**
 * When the two linked courses run in the same semester for the same students (same batch, both offered), the
 * prerequisite topic should come first. Compares the weeks of the two topics in the plans (source decides which plan).
 */
export async function corequisiteOrderIssues(courseId: string, source: Src): Promise<{ issues: OrderIssue[]; checked: number }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, coordinatorId: true, batchId: true, semesterNumber: true, isOffered: true } });
  if (!course || !course.batchId) return { issues: [], checked: 0 };
  const { asPrereq, asDependent } = await linksForCode(course.coordinatorId, course.code);
  const otherCodes = Array.from(new Set([...asPrereq.map((l) => l.dependentCourseCode), ...asDependent.map((l) => l.prereqCourseCode)]));
  if (!otherCodes.length) return { issues: [], checked: 0 };
  // Same batch, same semester: taught side by side.
  const others = await prisma.course.findMany({ where: { batchId: course.batchId, code: { in: otherCodes }, semesterNumber: course.semesterNumber, id: { not: course.id } }, select: { id: true, code: true } });
  if (!others.length) return { issues: [], checked: 0 };
  const weekOf = async (cid: string) => {
    const rows = await prisma.lectureRow.findMany({ where: { courseId: cid, source }, select: { topic: true, week: true, lectureNumber: true } });
    return rows.length ? rows : prisma.lectureRow.findMany({ where: { courseId: cid, source: "SE" }, select: { topic: true, week: true, lectureNumber: true } });
  };
  const mine = await weekOf(course.id);
  const issues: OrderIssue[] = [];
  let checked = 0;
  for (const o of others) {
    const theirs = await weekOf(o.id);
    const pairs = [
      ...asPrereq.filter((l) => l.dependentCourseCode === o.code).map((l) => ({ l, prereqRows: mine, depRows: theirs, thisSide: "prereq" as const })),
      ...asDependent.filter((l) => l.prereqCourseCode === o.code).map((l) => ({ l, prereqRows: theirs, depRows: mine, thisSide: "dependent" as const })),
    ];
    for (const p of pairs) {
      const a = rowsForTopic(p.prereqRows, p.l.prereqTopic), b = rowsForTopic(p.depRows, p.l.dependentTopic);
      if (!a.length || !b.length) continue;
      checked++;
      const firstA = Math.min(...a.map((r) => r.week)), firstB = Math.min(...b.map((r) => r.week));
      // The prerequisite topic has to be finished before the dependent one starts.
      const lastA = Math.max(...a.map((r) => r.week));
      if (lastA >= firstB) issues.push({ prereqCode: p.l.prereqCourseCode, prereqTopic: p.l.prereqTopic, prereqWeek: firstA === lastA ? firstA : lastA, dependentCode: p.l.dependentCourseCode, dependentTopic: p.l.dependentTopic, dependentWeek: firstB, thisSide: p.thisSide, otherCourseId: o.id });
    }
  }
  return { issues, checked };
}

// ---------------------------------------------------------------------------
// Results by topic and follow-ups

export type TopicResult = { topic: string; lectures: number[]; items: string[]; students: number; below: number; avgPct: number | null };

/**
 * How the class did on each taught topic: every quiz, assignment or exam question linked to the topic's lectures
 * counts; a student's topic score is marks obtained over marks possible on those items.
 */
export async function topicResults(courseId: string, passPct: number): Promise<TopicResult[]> {
  const rows = await prisma.lectureRow.findMany({
    where: { courseId, source: "INSTRUCTOR", topic: { not: "" } },
    select: { id: true, topic: true, lectureNumber: true, instrumentLinks: { select: { instrumentId: true, instrument: { select: { id: true, type: true, label: true, maxScore: true } } } } },
    orderBy: { lectureNumber: "asc" },
  });
  const marks = await prisma.studentMark.findMany({ where: { courseId }, select: { studentId: true, instrumentId: true, score: true } });
  const withdrawn = new Set((await prisma.studentEnrollment.findMany({ where: { courseId, status: "WITHDRAWN" }, select: { studentId: true } })).map((e) => e.studentId));
  const scoreOf = new Map<string, Map<string, number>>(); // instrument -> student -> score
  for (const m of marks) {
    if (withdrawn.has(m.studentId)) continue;
    if (!scoreOf.has(m.instrumentId)) scoreOf.set(m.instrumentId, new Map());
    scoreOf.get(m.instrumentId)!.set(m.studentId, m.score);
  }
  const groups = new Map<string, { topic: string; lectures: number[]; items: Map<string, { label: string; max: number }> }>();
  for (const r of rows) {
    if (isExamTopic(r.topic)) continue;
    const key = norm(r.topic);
    const g = groups.get(key) || { topic: r.topic, lectures: [] as number[], items: new Map<string, { label: string; max: number }>() };
    g.lectures.push(r.lectureNumber);
    for (const k of r.instrumentLinks) g.items.set(k.instrumentId, { label: k.instrument.type === "Midterm" || k.instrument.type === "Final" ? `${k.instrument.type} Q${k.instrument.label}` : k.instrument.label, max: k.instrument.maxScore });
    groups.set(key, g);
  }
  const out: TopicResult[] = [];
  for (const g of Array.from(groups.values())) {
    const perStudent = new Map<string, { got: number; max: number }>();
    for (const [iid, it] of Array.from(g.items.entries())) {
      const scores = scoreOf.get(iid);
      if (!scores) continue;
      for (const [sid, sc] of Array.from(scores.entries())) {
        const p = perStudent.get(sid) || { got: 0, max: 0 };
        p.got += sc; p.max += it.max;
        perStudent.set(sid, p);
      }
    }
    const pcts = Array.from(perStudent.values()).filter((p) => p.max > 0).map((p) => (100 * p.got) / p.max);
    out.push({
      topic: g.topic, lectures: g.lectures, items: Array.from(g.items.values()).map((i) => i.label),
      students: pcts.length, below: pcts.filter((p) => p < passPct).length,
      avgPct: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
    });
  }
  return out;
}

export type ProposedFollowUp = {
  kind: "WEAK_PREREQ" | "MISSED" | "WEAK"; topic: string; studentsBelow: number | null; studentsTotal: number | null;
  targetCourseId: string | null; targetCourseCode: string; targetTitle: string; targetTopic: string | null; recommendation: string;
};

/** Most students below the pass mark (and at least three assessed), so it is a class-wide gap rather than a few students. */
const isWeak = (t: TopicResult) => t.students >= 3 && t.below / t.students > 0.5;

/** What this course's results say the next courses must deal with. Nothing is saved here. */
export async function proposeFollowUps(courseId: string, viewer: Who): Promise<{ results: TopicResult[]; proposals: ProposedFollowUp[]; passPct: number; missedTopics: string[] }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, coordinatorId: true, batchId: true } });
  if (!course) return { results: [], proposals: [], passPct: 50, missedTopics: [] };
  const passPct = (await getPassingCriteria(await chairmanIdFor(viewer))).cloPct;
  const [results, analysis, links] = await Promise.all([topicResults(courseId, passPct), analyzeTeaching(courseId).catch(() => null), linksForCode(course.coordinatorId, course.code)]);
  const missedTopics = analysis ? analysis.topics.filter((t) => t.status === "missed" && t.se).map((t) => t.topic) : [];
  // The dependent course taken by the same students (same batch), if it exists yet.
  const depCodes = Array.from(new Set(links.asPrereq.map((l) => l.dependentCourseCode)));
  const sameBatch = course.batchId && depCodes.length
    ? await prisma.course.findMany({ where: { batchId: course.batchId, code: { in: depCodes } }, select: { id: true, code: true, title: true } })
    : [];
  const depCourse = (code: string) => sameBatch.find((c) => c.code === code) || null;
  const proposals: ProposedFollowUp[] = [];
  const seen = new Set<string>();
  const add = (p: ProposedFollowUp) => { const k = `${p.kind}|${norm(p.topic)}|${p.targetCourseCode}`; if (!seen.has(k)) { seen.add(k); proposals.push(p); } };

  for (const l of links.asPrereq) {
    const res = results.find((r) => sameTopic(r.topic, l.prereqTopic));
    const dep = depCourse(l.dependentCourseCode);
    if (res && isWeak(res)) {
      add({
        kind: "WEAK_PREREQ", topic: l.prereqTopic, studentsBelow: res.below, studentsTotal: res.students,
        targetCourseId: dep?.id || null, targetCourseCode: l.dependentCourseCode, targetTitle: l.dependentCourseTitle, targetTopic: l.dependentTopic,
        recommendation: `${res.below} of ${res.students} students who took ${course.code} scored below ${passPct}% on "${l.prereqTopic}", which "${l.dependentTopic}" in ${l.dependentCourseCode} builds on. Arrange a tutorial or extra class on "${l.prereqTopic}" before the class reaches "${l.dependentTopic}", and check it with a short quiz.`,
      });
    }
    if (missedTopics.some((m) => sameTopic(m, l.prereqTopic))) {
      add({
        kind: "MISSED", topic: l.prereqTopic, studentsBelow: null, studentsTotal: null,
        targetCourseId: dep?.id || null, targetCourseCode: l.dependentCourseCode, targetTitle: l.dependentCourseTitle, targetTopic: l.dependentTopic,
        recommendation: `"${l.prereqTopic}" was planned for ${course.code} but was not taught, and "${l.dependentTopic}" in ${l.dependentCourseCode} needs it. Cover "${l.prereqTopic}" before reaching "${l.dependentTopic}".`,
      });
    }
  }
  // For whoever teaches this same course next time.
  for (const m of missedTopics) {
    add({
      kind: "MISSED", topic: m, studentsBelow: null, studentsTotal: null, targetCourseId: null, targetCourseCode: course.code, targetTitle: course.title, targetTopic: null,
      recommendation: `"${m}" is in the approved plan of ${course.code} but was not taught in this offering. Make sure the next offering covers it (and plan time for it early).`,
    });
  }
  for (const r of results.filter(isWeak)) {
    add({
      kind: "WEAK", topic: r.topic, studentsBelow: r.below, studentsTotal: r.students, targetCourseId: null, targetCourseCode: course.code, targetTitle: course.title, targetTopic: null,
      recommendation: `"${r.topic}" was taught and assessed (${r.items.join(", ")}), but ${r.below} of ${r.students} students scored below ${passPct}%. Next time give it more practice and an early check, and review how it is taught and assessed.`,
    });
  }
  return { results, proposals, passPct, missedTopics };
}

/** Saves the proposals (once per topic and target) and tells the teachers of the target courses and the OMC. */
export async function sendFollowUps(courseId: string, user: Who): Promise<{ created: number; updated: number }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, coordinatorId: true } });
  if (!course) return { created: 0, updated: 0 };
  const chairmanId = await chairmanIdFor(user);
  const { proposals } = await proposeFollowUps(courseId, user);
  let created = 0, updated = 0;
  const tell: { ids: (string | null)[]; title: string; body: string }[] = [];
  for (const p of proposals) {
    const key = { sourceCourseId_kind_topic_targetCourseCode: { sourceCourseId: course.id, kind: p.kind, topic: p.topic, targetCourseCode: p.targetCourseCode } };
    const before = await prisma.topicFollowUp.findUnique({ where: key });
    await prisma.topicFollowUp.upsert({
      where: key,
      create: { chairmanId, coordinatorId: course.coordinatorId, sourceCourseId: course.id, sourceCourseCode: course.code, topic: p.topic, kind: p.kind, studentsBelow: p.studentsBelow, studentsTotal: p.studentsTotal, targetCourseId: p.targetCourseId, targetCourseCode: p.targetCourseCode, targetTopic: p.targetTopic, recommendation: p.recommendation, createdById: user.id },
      update: { studentsBelow: p.studentsBelow, studentsTotal: p.studentsTotal, targetCourseId: p.targetCourseId ?? undefined, recommendation: p.recommendation },
    });
    if (before) { updated++; continue; }
    created++;
    if (p.targetCourseId) {
      const t = await prisma.course.findUnique({ where: { id: p.targetCourseId }, select: { instructorId: true, subjectExpertId: true } });
      tell.push({ ids: [t?.instructorId || null, t?.subjectExpertId || null], title: `Follow-up for ${p.targetCourseCode}: "${p.targetTopic || p.topic}"`, body: p.recommendation });
    }
  }
  for (const t of tell) await notifyUsers(t.ids, { kind: "FOLLOW_UP", title: t.title, body: t.body, href: "/follow-ups", exceptId: user.id });
  if (created) await notifyUsers(await holdersOf(chairmanId, "OMC"), { kind: "FOLLOW_UP", title: `${created} new topic follow-up${created === 1 ? "" : "s"} from ${course.code}`, body: "Assign a teacher where a tutorial or extra class is needed.", href: "/follow-ups", exceptId: user.id });
  return { created, updated };
}

export type FollowUpRow = {
  id: string; chairmanId: string; coordinatorId: string; sourceCourseId: string; sourceCourseCode: string; topic: string; kind: string;
  studentsBelow: number | null; studentsTotal: number | null; targetCourseId: string | null; targetCourseCode: string; targetTopic: string | null;
  recommendation: string; status: string; assignedToId: string | null; actionTaken: string | null; actionById: string | null; actionAt: Date | null; createdById: string; createdAt: Date;
};

/** Follow-ups this person acts on (their courses, or assigned to them) and, for managers, everything in their area. */
export async function followUpsFor(user: Who): Promise<{ act: FollowUpRow[]; oversee: FollowUpRow[]; canAssign: boolean; missingTable: boolean }> {
  try {
    const chairmanId = await chairmanIdFor(user);
    const mine = await prisma.course.findMany({ where: { OR: [{ instructorId: user.id }, { subjectExpertId: user.id }] }, select: { id: true, code: true, coordinatorId: true } });
    const myIds = mine.map((c) => c.id);
    const act = (await prisma.topicFollowUp.findMany({
      where: {
        chairmanId,
        OR: [
          { assignedToId: user.id },
          { targetCourseId: { in: myIds.length ? myIds : ["none"] } },
          // "Next time this course is taught": any later offering of the same code in the same program.
          ...mine.map((c) => ({ targetCourseId: null, targetCourseCode: c.code, coordinatorId: c.coordinatorId, sourceCourseId: { not: c.id } })),
        ],
      },
      orderBy: { createdAt: "desc" }, take: 300,
    })) as FollowUpRow[];
    let oversee: FollowUpRow[] = [];
    const manager = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "CHAIRMAN", "DEPARTMENT_COORDINATOR"].includes(user.role);
    if (manager) {
      const scope: Record<string, unknown> =
        user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id }
          : user.role === "HEAD_OF_DEPARTMENT" || user.role === "DEPARTMENT_COORDINATOR" ? { coordinatorId: { in: (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", departmentId: user.departmentId || "none" }, select: { id: true } })).map((u) => u.id).concat(["none"]) } }
            : user.role === "DEAN" ? { coordinatorId: { in: (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", department_: { facultyId: user.facultyId || "none" } }, select: { id: true } })).map((u) => u.id).concat(["none"]) } }
              : user.role === "OMC" && user.departmentId ? { sourceCourseId: { in: (await prisma.course.findMany({ where: { coordinator: { managedById: user.managedById || "" }, ...omcCourseScope(user) }, select: { id: true } })).map((c) => c.id).concat(["none"]) } }
                : {};
      oversee = (await prisma.topicFollowUp.findMany({ where: { chairmanId, ...scope }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 })) as FollowUpRow[];
    }
    return { act, oversee, canAssign: user.role === "OMC" || user.role === "PROGRAM_COORDINATOR" || user.role === "HEAD_OF_DEPARTMENT", missingTable: false };
  } catch {
    return { act: [], oversee: [], canAssign: false, missingTable: true };
  }
}
