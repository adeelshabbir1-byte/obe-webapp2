import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { getPassingCriteria } from "./passingCriteria";
import { isExamTopic, norm } from "./teachingAnalysis";
import { rowsForTopic, sameTopic } from "./topicLinks";
import { courseIdsForKey, keyOf, keysOf, type CourseKey } from "./courseKeys";

// What a topic prerequisite does downstream, and how changes reach the dependent courses.
//
// Each link has a strength. STRONG: a student can't register for the dependent course until they have passed the
// prerequisite course and attained the prerequisite topic (or cleared it through remediation). MILD / WEAK: they may
// register, and the dependent course's teacher plans a review of the topic in their lecture plan (MILD: a proper
// review; WEAK: a short recap). Adding, removing or re-grading a link, or renaming / deleting the topic in the base
// course's plan, takes effect at once everywhere (registration and review prompts read the links live) and the
// teachers of every dependent course offering are told.

export const STRENGTHS: Record<string, { label: string; short: string; color: string }> = {
  STRONG: { label: "Strong", short: "Must be attained before registering", color: "var(--rust)" },
  MILD: { label: "Mild", short: "Review it in the dependent course", color: "var(--brass)" },
  WEAK: { label: "Weak", short: "A short recap in the dependent course", color: "var(--slate)" },
};
export const strengthOf = (s: string | null | undefined) => (s && STRENGTHS[s] ? s : "MILD");

type Link = { id: string; coordinatorId: string; prereqCourseCode: string; prereqCourseTitle: string; prereqTopic: string; dependentCourseCode: string; dependentCourseTitle: string; dependentTopic: string; strength: string };
type Actor = { id: string; name: string };

/** What the link means for students and teachers, in one sentence. */
export function effectOf(l: Pick<Link, "prereqCourseCode" | "prereqTopic" | "dependentCourseCode" | "dependentTopic" | "strength">) {
  const s = strengthOf(l.strength);
  if (s === "STRONG") return `Students must pass ${l.prereqCourseCode} and attain "${l.prereqTopic}" (or clear it through remediation) before they can register for ${l.dependentCourseCode}.`;
  if (s === "MILD") return `Students may register for ${l.dependentCourseCode}; its teacher plans a review of "${l.prereqTopic}" before reaching "${l.dependentTopic}".`;
  return `Students may register for ${l.dependentCourseCode}; its teacher gives a short recap of "${l.prereqTopic}" before "${l.dependentTopic}".`;
}

/** The dependent course offerings a link reaches (every batch's copy and every course copying it), with their teachers. */
export async function downstreamOfferings(l: Pick<Link, "coordinatorId" | "dependentCourseCode">) {
  const ids = await courseIdsForKey({ coordinatorId: l.coordinatorId, code: l.dependentCourseCode });
  if (!ids.length) return [];
  return prisma.course.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, title: true, isOffered: true, instructorId: true, subjectExpertId: true, semesterNumber: true, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: [{ isOffered: "desc" }, { semesterNumber: "asc" }],
  });
}

/** Tells the teachers of the dependent offerings (and the prerequisite course's Subject Expert) about a change to a link. */
export async function announceLinkChange(l: Link, change: "ADDED" | "REMOVED" | "STRENGTH" | "RENAMED" | "ORPHANED", actor: Actor | null, detail = "") {
  const offerings = await downstreamOfferings(l);
  const prereq = await courseIdsForKey({ coordinatorId: l.coordinatorId, code: l.prereqCourseCode });
  const prereqSe = prereq.length ? await prisma.course.findMany({ where: { id: { in: prereq } }, select: { subjectExpertId: true } }) : [];
  const who = [...offerings.flatMap((o) => [o.instructorId, o.subjectExpertId]), ...prereqSe.map((c) => c.subjectExpertId)];
  const pair = `"${l.prereqTopic}" (${l.prereqCourseCode}) → "${l.dependentTopic}" (${l.dependentCourseCode})`;
  const label = STRENGTHS[strengthOf(l.strength)].label;
  const title =
    change === "ADDED" ? `New ${label.toLowerCase()} prerequisite: ${pair}`
      : change === "REMOVED" ? `Prerequisite removed: ${pair}`
        : change === "STRENGTH" ? `Prerequisite now ${label.toLowerCase()}: ${pair}`
          : change === "RENAMED" ? `Prerequisite topic renamed: ${pair}`
            : `Prerequisite topic no longer in the plan: ${pair}`;
  const body =
    change === "REMOVED" ? `${actor ? `${actor.name} removed this link. ` : ""}It no longer affects registration or your lecture plan.`
      : change === "ORPHANED" ? `${detail} Until the link is pointed at the right topic (or removed) on Prerequisite Topics, it has no effect.`
        : `${detail ? `${detail} ` : ""}${effectOf(l)}`;
  await notifyUsers(who, { kind: "TOPIC_LINK", title, body, href: "/topic-prerequisites", exceptId: actor?.id });
  return offerings.length;
}

/** All Subject Expert lecture-plan topics across the courses a key covers (a link stays valid while any copy has the topic). */
async function keyTopics(key: CourseKey) {
  const ids = await courseIdsForKey(key);
  const rows = ids.length ? await prisma.lectureRow.findMany({ where: { courseId: { in: ids }, source: "SE", topic: { not: "" } }, select: { topic: true } }) : [];
  return rows.map((r) => r.topic).filter((t) => !isExamTopic(t));
}

/**
 * After a topic in a base course's plan is renamed: links that used the old wording follow the new one (unless another
 * copy of the course still teaches the old topic).
 */
export async function cascadeTopicRename(courseId: string, oldTopic: string, newTopic: string, actor: Actor) {
  if (!oldTopic || !newTopic || norm(oldTopic) === norm(newTopic)) return 0;
  const key = await keyOf(courseId);
  if (!key) return 0;
  const topics = await keyTopics(key);
  if (topics.some((t) => sameTopic(t, oldTopic))) return 0; // still taught under the old wording somewhere
  const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, OR: [{ prereqCourseCode: key.code }, { dependentCourseCode: key.code }] } }).catch(() => []);
  let changed = 0;
  for (const l of links) {
    const side = l.prereqCourseCode === key.code && sameTopic(l.prereqTopic, oldTopic) ? "prereq" : l.dependentCourseCode === key.code && sameTopic(l.dependentTopic, oldTopic) ? "dependent" : null;
    if (!side) continue;
    const data = side === "prereq" ? { prereqTopic: newTopic, orphanedAt: null } : { dependentTopic: newTopic, orphanedAt: null };
    const u = await prisma.topicPrerequisite.update({ where: { id: l.id }, data }).catch(() => null);
    if (!u) {
      // The same link already exists under the new wording: the old one is a duplicate.
      await dropReviewPlans(l);
      await prisma.topicPrerequisite.delete({ where: { id: l.id } }).catch(() => null);
      continue;
    }
    changed++;
    // Reviews already planned for it keep their place in the teachers' plans, under the new wording.
    if (side === "prereq") {
      const plans = await prisma.prereqReviewPlan.findMany({ where: { linkId: l.id } }).catch(() => []);
      for (const p of plans) { await setReviewMarker(p.courseId, p.lectureNumber, reviewMarker(l), false); await setReviewMarker(p.courseId, p.lectureNumber, reviewMarker(u), true); }
    }
    await announceLinkChange(u, "RENAMED", actor, `"${oldTopic}" was renamed to "${newTopic}" in ${key.code}.`);
  }
  // Remediation already done on the topic keeps counting under the new wording.
  const remedies = await prisma.remediationPlan.findMany({ where: { coordinatorId: key.coordinatorId, courseCode: key.code } }).catch(() => []);
  for (const p of remedies) {
    if (p.topics.some((t) => sameTopic(t, oldTopic))) await prisma.remediationPlan.update({ where: { id: p.id }, data: { topics: p.topics.map((t) => (sameTopic(t, oldTopic) ? newTopic : t)) } });
  }
  return changed;
}

/**
 * Re-checks every link of a course against its lecture plan(s): a link whose topic is gone is marked orphaned (it then
 * has no effect and the teachers are told); one whose topic is back is restored. Call after the plan changes.
 */
export async function reconcileLinks(courseId: string, actor: Actor | null) {
  const key = await keyOf(courseId);
  if (!key) return { orphaned: 0, restored: 0 };
  const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, OR: [{ prereqCourseCode: key.code }, { dependentCourseCode: key.code }] } }).catch(() => []);
  if (!links.length) return { orphaned: 0, restored: 0 };
  const cache = new Map<string, string[]>();
  const topicsFor = async (code: string) => { if (!cache.has(code)) cache.set(code, await keyTopics({ coordinatorId: key.coordinatorId, code })); return cache.get(code)!; };
  let orphaned = 0, restored = 0;
  for (const l of links) {
    const [pt, dt] = await Promise.all([topicsFor(l.prereqCourseCode), topicsFor(l.dependentCourseCode)]);
    // A course with no plan at all yet is not a reason to orphan its links.
    const missing = [pt.length && !pt.some((t) => sameTopic(t, l.prereqTopic)) ? `"${l.prereqTopic}" is no longer in the lecture plan of ${l.prereqCourseCode}.` : "", dt.length && !dt.some((t) => sameTopic(t, l.dependentTopic)) ? `"${l.dependentTopic}" is no longer in the lecture plan of ${l.dependentCourseCode}.` : ""].filter(Boolean);
    if (missing.length && !l.orphanedAt) {
      await prisma.topicPrerequisite.update({ where: { id: l.id }, data: { orphanedAt: new Date() } });
      await announceLinkChange(l, "ORPHANED", actor, missing.join(" "));
      orphaned++;
    } else if (!missing.length && l.orphanedAt) {
      await prisma.topicPrerequisite.update({ where: { id: l.id }, data: { orphanedAt: null } });
      restored++;
    }
  }
  return { orphaned, restored };
}

// ---------------------------------------------------------------------------
// MILD / WEAK: review modules in the dependent course

export type ReviewPrompt = {
  linkId: string; strength: string; prereqCourseCode: string; prereqCourseTitle: string; prereqTopic: string; dependentTopic: string;
  dependentLectures: number[]; plan: { lectureNumber: number | null; status: string; note: string | null } | null;
};

/** The reviews this course offering must plan (one per MILD / WEAK link into it), and where they are planned. */
export async function reviewPromptsFor(courseId: string): Promise<{ prompts: ReviewPrompt[]; lectures: { lectureNumber: number; week: number; topic: string }[]; missingTable: boolean }> {
  try {
    const key = await keyOf(courseId);
    if (!key) return { prompts: [], lectures: [], missingTable: false };
    const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, dependentCourseCode: key.code, strength: { in: ["MILD", "WEAK"] }, orphanedAt: null }, orderBy: { createdAt: "asc" } });
    if (!links.length) return { prompts: [], lectures: [], missingTable: false };
    const [plans, rows] = await Promise.all([
      prisma.prereqReviewPlan.findMany({ where: { courseId, linkId: { in: links.map((l) => l.id) } } }),
      prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { lectureNumber: true, week: true, topic: true }, orderBy: { lectureNumber: "asc" } }),
    ]);
    const planRows = rows.length ? rows : await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { lectureNumber: true, week: true, topic: true }, orderBy: { lectureNumber: "asc" } });
    return {
      prompts: links.map((l) => {
        const p = plans.find((x) => x.linkId === l.id);
        return {
          linkId: l.id, strength: l.strength, prereqCourseCode: l.prereqCourseCode, prereqCourseTitle: l.prereqCourseTitle, prereqTopic: l.prereqTopic, dependentTopic: l.dependentTopic,
          dependentLectures: rowsForTopic(planRows, l.dependentTopic).map((r) => r.lectureNumber),
          plan: p ? { lectureNumber: p.lectureNumber, status: p.status, note: p.note } : null,
        };
      }),
      lectures: planRows,
      missingTable: false,
    };
  } catch {
    return { prompts: [], lectures: [], missingTable: true };
  }
}

/** The marker added to the chosen lecture of the teacher's plan, so the review shows in the plan itself. */
export const reviewMarker = (l: { prereqTopic: string; prereqCourseCode: string }) => `[Review: ${l.prereqTopic} (${l.prereqCourseCode})]`;

/** Adds or removes the review marker on one lecture of a course's teacher plan. */
export async function setReviewMarker(courseId: string, lectureNumber: number | null, marker: string, on: boolean) {
  if (!lectureNumber) return;
  const row = await prisma.lectureRow.findFirst({ where: { courseId, source: "INSTRUCTOR", lectureNumber } });
  if (!row) return;
  const without = (row.subtopic || "").split(marker).join("").replace(/\s{2,}/g, " ").trim();
  const next = on ? `${without}${without ? " " : ""}${marker}` : without;
  if (next !== (row.subtopic || "")) await prisma.lectureRow.update({ where: { id: row.id }, data: { subtopic: next || null } });
}

/** A link was removed or became STRONG: its planned reviews are dropped and their markers taken out of the plans. */
export async function dropReviewPlans(l: { id: string; prereqTopic: string; prereqCourseCode: string }) {
  const plans = await prisma.prereqReviewPlan.findMany({ where: { linkId: l.id } }).catch(() => []);
  for (const p of plans) await setReviewMarker(p.courseId, p.lectureNumber, reviewMarker(l), false);
  if (plans.length) await prisma.prereqReviewPlan.deleteMany({ where: { linkId: l.id } });
  return plans.length;
}

// ---------------------------------------------------------------------------
// STRONG: registration

/** A student's score on one topic of a course they took: marks on every item linked to the topic's lectures. */
export async function studentTopicPct(studentId: string, courseId: string, topic: string): Promise<number | null> {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR", topic: { not: "" } }, select: { topic: true, lectureNumber: true, instrumentLinks: { select: { instrumentId: true, instrument: { select: { maxScore: true } } } } } });
  let matched = rowsForTopic(rows, topic);
  if (!matched.length) {
    // The teacher's copy may still use older wording (the Subject Expert renamed the topic): match by lecture number.
    const se = await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { topic: true, lectureNumber: true } });
    const nums = new Set(rowsForTopic(se, topic).map((r) => r.lectureNumber));
    matched = rows.filter((r) => nums.has(r.lectureNumber));
  }
  const items = new Map<string, number>();
  for (const r of matched) for (const k of r.instrumentLinks) items.set(k.instrumentId, k.instrument.maxScore);
  if (!items.size) return null;
  const marks = await prisma.studentMark.findMany({ where: { studentId, instrumentId: { in: Array.from(items.keys()) } }, select: { instrumentId: true, score: true } });
  if (!marks.length) return null;
  const max = marks.reduce((n, m) => n + (items.get(m.instrumentId) || 0), 0);
  return max > 0 ? Math.round((1000 * marks.reduce((n, m) => n + m.score, 0)) / max) / 10 : null;
}

/** Topics a student has cleared through remediation: "COURSECODE|normalized topic". */
export async function clearedTopics(studentId: string): Promise<Set<string>> {
  try {
    const done = await prisma.remediationEnrollment.findMany({ where: { studentId, status: "CLEARED" }, select: { planId: true } });
    if (!done.length) return new Set();
    const plans = await prisma.remediationPlan.findMany({ where: { id: { in: done.map((d) => d.planId) } }, select: { courseCode: true, topics: true } });
    return new Set(plans.flatMap((p) => p.topics.map((t) => `${p.courseCode.toUpperCase()}|${norm(t)}`)));
  } catch {
    return new Set();
  }
}
const isCleared = (cleared: Set<string>, codes: string[], topic: string) =>
  Array.from(cleared).some((k) => { const [code, t] = k.split("|"); return codes.includes(code) && (t === norm(topic) || sameTopic(t, topic)); });

/**
 * Why a student may not register for a course because of its STRONG topic prerequisites ([] = nothing in the way).
 * The prerequisite course must be passed (or, where the rules allow, taken in the same semester), and each STRONG
 * topic attained in the student's attempt — unless no marks are recorded for it — or cleared through remediation.
 */
export async function strongPrereqIssues(input: { studentId: string; batchId: string; chairmanId: string; courseId: string; passed: Map<string, number> | Set<string>; takenTogether: (codes: string[]) => boolean; allowTogether: boolean }): Promise<string[]> {
  let links: Link[] = [];
  const key = await keyOf(input.courseId);
  if (!key) return [];
  try {
    links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, dependentCourseCode: key.code, strength: "STRONG", orphanedAt: null } });
  } catch { return []; }
  if (!links.length) return [];
  // The student's own copies of each prerequisite course (their batch's courses that keep their links under that code).
  const batch = await prisma.course.findMany({ where: { batchId: input.batchId }, select: { id: true, code: true } });
  const batchKeys = await keysOf(batch.map((c) => c.id));
  const has = (code: string) => (input.passed instanceof Map ? input.passed.has(code) : input.passed.has(code));
  const passPct = (await getPassingCriteria(input.chairmanId)).cloPct;
  const cleared = await clearedTopics(input.studentId);
  const issues: string[] = [];
  for (const code of Array.from(new Set(links.map((l) => l.prereqCourseCode)))) {
    const group = links.filter((l) => l.prereqCourseCode === code);
    const codes = Array.from(new Set([code, ...batch.filter((c) => batchKeys.get(c.id)?.code === code && batchKeys.get(c.id)?.coordinatorId === key.coordinatorId).map((c) => c.code)].map((x) => x.toUpperCase())));
    const topics = Array.from(new Set(group.map((l) => l.prereqTopic)));
    if (!codes.some(has)) {
      if (input.allowTogether && input.takenTogether(codes)) continue;
      issues.push(`Strong prerequisite: pass ${code} ${group[0].prereqCourseTitle} first — ${topics.map((t) => `"${t}"`).join(", ")} ${topics.length > 1 ? "are" : "is"} needed for this course.`);
      continue;
    }
    // Passed: check the topics in the student's latest attempt that has marks.
    const attempts = await prisma.studentEnrollment.findMany({ where: { studentId: input.studentId, status: { not: "WITHDRAWN" }, course: { code: { in: codes, mode: "insensitive" } } }, select: { courseId: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    for (const t of topics) {
      if (isCleared(cleared, codes, t)) continue;
      let pct: number | null = null;
      for (const a of attempts) { pct = await studentTopicPct(input.studentId, a.courseId, t); if (pct !== null) break; }
      if (pct !== null && pct < passPct) issues.push(`Strong prerequisite topic "${t}" of ${code} is not attained (${pct}% against ${passPct}%). Clear it through a remediation tutorial and micro-assessment first.`);
    }
  }
  return issues;
}
