import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { omcOfCourse, tally, isMember, type Member } from "./omcMembers";

// The Subject Expert's plan of a course, step by step (details · CLOs · lecture plan · assessments · midterm & final
// questions · review & submit), and its approval by the department's OMC: every member votes, more than half approving
// carries it and the Convener confirms. The OMC's changes go to the Subject Expert as suggestions with reasons; the SE adds
// them or replies with reasons, over as many rounds as needed. If they don't settle, the Convener finalises the OMC's
// version and the plan carries the note "Finalised by the OMC, not the Subject Expert" for good.

const db = prisma as unknown as Record<string, any>;

export const SE_STEPS = [
  { key: "details", title: "Course details", tab: "clos", what: "outline, books, catalogue description" },
  { key: "clos", title: "CLOs", tab: "clos", what: "Bloom level, mapped to the GAs the OMC decided" },
  { key: "lectures", title: "Lecture plan", tab: "schedule", what: "every lecture tied to a CLO" },
  { key: "assessments", title: "Assessment plan", tab: "weights", what: "weights and counts within the OMC's limits" },
  { key: "questions", title: "Midterm & final questions", tab: "paper-distribution", what: "marks per CLO in each paper" },
  { key: "review", title: "Review and submit to OMC", tab: "instruments", what: "check everything, then submit" },
] as const;
export type StepKey = (typeof SE_STEPS)[number]["key"];

export type PlanChecks = Record<Exclude<StepKey, "review">, boolean>;

/** What the plan has so far — used for the SE strip and the red flags ("CLOs ✓ · lecture plan ✗ · assessments ✗"). */
export async function planChecks(courseId: string): Promise<PlanChecks> {
  const [c, clos, lectures, instruments, papers] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { catalogDescription: true, textbook: true, referenceMaterial: true, weightsConfirmedAt: true } }),
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, select: { bloomLevel: true, mappedPloId: true } }),
    prisma.lectureRow.count({ where: { courseId, source: "SE" } }),
    prisma.assessmentInstrument.count({ where: { courseId, source: "SE" } }),
    prisma.paperDistributionItem.count({ where: { courseId, source: "SE" } }),
  ]);
  return {
    details: !!(c?.catalogDescription?.trim() && (c.textbook?.trim() || c.referenceMaterial?.trim())),
    clos: clos.length > 0 && clos.every((x) => !!x.bloomLevel && !!x.mappedPloId),
    lectures: lectures > 0,
    assessments: instruments > 0 || !!c?.weightsConfirmedAt,
    questions: papers > 0,
  };
}
export const CHECK_LABEL: Record<keyof PlanChecks, string> = { details: "course details", clos: "CLOs", lectures: "lecture plan", assessments: "assessments", questions: "exam questions" };
export const checksLine = (k: PlanChecks) => (Object.keys(CHECK_LABEL) as (keyof PlanChecks)[]).map((x) => `${CHECK_LABEL[x]} ${k[x] ? "✓" : "✗"}`).join(" · ").replace(/^./, (s) => s.toUpperCase());

export type PlanState = {
  courseId: string; round: number; status: string; approved: boolean; carried: { from: string; at: Date | null; rechecked: boolean } | null;
  finalisedByOmc: boolean; overridden: string[]; approvedAt: Date | null;
};

export async function stateOf(courseId: string): Promise<PlanState | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, templateStatus: true } });
  if (!c) return null;
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  let overridden: string[] = [];
  try { overridden = s?.overriddenJson ? JSON.parse(s.overriddenJson) : []; } catch { overridden = []; }
  return {
    courseId, round: s?.round || 1, status: c.templateStatus, approved: c.templateStatus === "approved",
    carried: s?.carriedFromBatch && c.templateStatus === "approved" ? { from: s.carriedFromBatch, at: s.carriedApprovedAt || null, rechecked: !!s.recheckedAt } : null,
    finalisedByOmc: !!s?.finalisedByOmc, overridden, approvedAt: s?.approvedAt || null,
  };
}

/** Approved plans per course (a plan carried from the previous batch counts as approved). */
export async function approvedMap(courseIds: string[]) {
  const rows = await prisma.course.findMany({ where: { id: { in: courseIds.concat("none") } }, select: { id: true, templateStatus: true } });
  return new Map(rows.map((r) => [r.id, r.templateStatus === "approved"]));
}

/** The SE's deadline for submitting the plan, from the semester plan (the course's own, else the standing one). */
export async function seDeadline(courseId: string): Promise<Date | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true } } } });
  const d = await prisma.deadline.findFirst({ where: { kind: "SUBMITTED", completedAt: null, OR: [{ courseId }, { allCourses: true, chairmanId: c?.coordinator.managedById || "none" }] }, orderBy: { dueDate: "asc" }, select: { dueDate: true } }).catch(() => null);
  return d?.dueDate || null;
}

/** Red flags for a set of courses: which plans are not OMC-approved yet and what they still miss (few queries for many courses). */
export async function planFlags(courseIds: string[]) {
  const ids = courseIds.concat("none");
  const [cs, clos, lec, ins, pap, states, dls] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, templateStatus: true, catalogDescription: true, textbook: true, referenceMaterial: true, weightsConfirmedAt: true, coordinator: { select: { managedById: true } } } }),
    prisma.cLO.findMany({ where: { courseId: { in: ids }, source: "SE" }, select: { courseId: true, bloomLevel: true, mappedPloId: true } }),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { id: true } }),
    prisma.assessmentInstrument.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { id: true } }),
    prisma.paperDistributionItem.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { id: true } }),
    db.sePlanState.findMany({ where: { courseId: { in: ids } } }).catch(() => []) as Promise<{ courseId: string; carriedFromBatch: string | null; recheckedAt: Date | null }[]>,
    prisma.deadline.findMany({ where: { kind: "SUBMITTED", completedAt: null, OR: [{ courseId: { in: ids } }, { allCourses: true }] }, orderBy: { dueDate: "asc" }, select: { courseId: true, allCourses: true, chairmanId: true, dueDate: true } }).catch(() => []),
  ]);
  const has = (rows: { courseId: string }[], id: string) => rows.some((r) => r.courseId === id);
  const out = new Map<string, { approved: boolean; line: string; deadline: Date | null; carried: string | null }>();
  for (const c of cs) {
    const st = states.find((x) => x.courseId === c.id);
    if (c.templateStatus === "approved") { out.set(c.id, { approved: true, line: "", deadline: null, carried: st?.carriedFromBatch && !st.recheckedAt ? st.carriedFromBatch : null }); continue; }
    const mine = clos.filter((x) => x.courseId === c.id);
    const k: PlanChecks = {
      details: !!(c.catalogDescription?.trim() && (c.textbook?.trim() || c.referenceMaterial?.trim())),
      clos: mine.length > 0 && mine.every((x) => !!x.bloomLevel && !!x.mappedPloId),
      lectures: has(lec, c.id), assessments: has(ins, c.id) || !!c.weightsConfirmedAt, questions: has(pap, c.id),
    };
    const dl = dls.find((d) => d.courseId === c.id) || dls.find((d) => d.allCourses && d.chairmanId === c.coordinator.managedById);
    out.set(c.id, { approved: false, line: checksLine(k), deadline: dl?.dueDate || null, carried: null });
  }
  return out;
}
export const flagText = (f: { line: string; deadline: Date | null } | undefined) => (f ? `${f.line}${f.deadline ? ` · SE due ${new Date(f.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}` : "");

/** Registration for a batch's semester opens only when every course offered that semester has an OMC-approved plan. */
export async function registrationGate(batchId: string) {
  const offered = await prisma.course.findMany({ where: { batchId, isOffered: true }, select: { id: true, code: true, title: true } });
  const flags = await planFlags(offered.map((c) => c.id));
  const missing = offered.filter((c) => !flags.get(c.id)?.approved).map((c) => ({ ...c, line: flagText(flags.get(c.id)) }));
  return { offered: offered.length, missing };
}

// --------------------------------------------------------------------------------------------- voting
export type VoteView = {
  round: number; members: Member[]; convenerId: string | null; convenerName: string;
  votes: { memberId: string; name: string; approve: boolean; comment: string | null; at: Date }[];
  tally: ReturnType<typeof tally>; previous: { batch: string; at: Date | null } | null;
  suggestions: Suggestion[]; rounds: { round: number; votes: number; approvals: number }[];
};
export type Suggestion = { id: string; round: number; step: string; item: string | null; text: string; reason: string; byName: string; createdAt: Date; status: string; reply: string | null; repliedAt: Date | null };

export async function voteView(courseId: string): Promise<VoteView | null> {
  const omc = await omcOfCourse(courseId);
  const st = await stateOf(courseId);
  if (!omc || !st) return null;
  const all = ((await db.sePlanVote.findMany({ where: { courseId }, orderBy: { at: "asc" } }).catch(() => [])) as { round: number; memberId: string; approve: boolean; comment: string | null; at: Date }[]);
  const names = new Map(omc.members.map((m) => [m.id, m.name]));
  const extra = all.filter((v) => !names.has(v.memberId)).map((v) => v.memberId);
  if (extra.length) for (const u of await prisma.user.findMany({ where: { id: { in: extra } }, select: { id: true, name: true } })) names.set(u.id, u.name);
  const votes = all.filter((v) => v.round === st.round).map((v) => ({ ...v, name: names.get(v.memberId) || "—" }));
  const sugg = ((await db.sePlanSuggestion.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Suggestion[]);
  const rounds = Array.from(new Set(all.map((v) => v.round))).sort((a, b) => a - b).map((r) => ({ round: r, votes: all.filter((v) => v.round === r).length, approvals: all.filter((v) => v.round === r && v.approve).length }));
  // "Approved last semester for BSCS Fall 2026 by the OMC (date)" — the previous batch's approval of the same course.
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  let previous: VoteView["previous"] = s?.carriedFromBatch ? { batch: s.carriedFromBatch, at: s.carriedApprovedAt || null } : null;
  if (!previous) {
    const { previousOf } = await import("./batchFlow");
    const p = await previousOf(courseId).catch(() => null);
    if (p?.templateStatus === "approved") previous = { batch: `${p.batch?.degreeProgram || ""} ${p.batch?.batchName || ""}`.trim(), at: null };
  }
  return { round: st.round, members: omc.members, convenerId: omc.convenerId, convenerName: omc.convenerName, votes, tally: tally(omc.members, votes.map((v) => ({ memberId: v.memberId, yes: v.approve }))), previous, suggestions: sugg, rounds };
}

async function courseOf(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, templateStatus: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
}

/** A member's vote on the plan (approve or not, with a comment). */
export async function castVote(user: { id: string; name: string }, courseId: string, approve: boolean, comment: string) {
  const c = await courseOf(courseId);
  const omc = await omcOfCourse(courseId);
  if (!c || !omc) throw new Error("Course not found.");
  if (!isMember(omc, user.id)) throw new Error("Only a member of this course's OMC votes on its plan.");
  if (c.templateStatus !== "submitted") throw new Error("The plan isn't waiting for the OMC.");
  if (!approve && comment.trim().length < 3) throw new Error("Say why (a comment) when you don't approve.");
  const st = await stateOf(courseId);
  const round = st?.round || 1;
  await db.sePlanVote.upsert({ where: { courseId_round_memberId: { courseId, round, memberId: user.id } }, create: { courseId, round, memberId: user.id, approve, comment: comment.trim() || null }, update: { approve, comment: comment.trim() || null, at: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "SE_PLAN_VOTE_APPROVE" : "SE_PLAN_VOTE_NOT", entityType: "Course", entityId: courseId, metadata: { round, comment } }).catch(() => null);
  const v = await voteView(courseId);
  if (v?.tally.carried && omc.convenerId && omc.convenerId !== user.id) await notifyUsers([omc.convenerId], { kind: "TEMPLATE", title: `${c.code}: the OMC's majority approves the plan — please confirm`, body: `Votes: ${v.tally.yes} of ${v.tally.total} approved.`, href: `/omc/templates/${courseId}` });
  return v;
}

/** The Convener confirms a majority approval: the plan is OMC-approved. */
export async function confirmApproval(user: { id: string; name: string }, courseId: string) {
  const c = await courseOf(courseId);
  const v = await voteView(courseId);
  if (!c || !v) throw new Error("Course not found.");
  if (v.convenerId !== user.id) throw new Error("Only the OMC Convener confirms.");
  if (c.templateStatus !== "submitted") throw new Error("The plan isn't waiting for the OMC.");
  if (!v.tally.carried) throw new Error(`More than half of the members must approve first (${v.tally.yes} of ${v.tally.total}; ${v.tally.need} needed).`);
  await setApproved(user, courseId, false, []);
  await notifyUsers([c.subjectExpertId, c.coordinatorId], { kind: "TEMPLATE", title: `${c.code} plan approved by the OMC`, body: `Votes: ${v.tally.yes} of ${v.tally.total} approved; confirmed by ${user.name}.`, href: `/subjectexpert/courses/${courseId}/clos` });
}

async function setApproved(user: { id: string }, courseId: string, byOmc: boolean, overridden: string[]) {
  await prisma.course.update({ where: { id: courseId }, data: { templateStatus: "approved", templateReviewedById: user.id } });
  await db.sePlanState.upsert({
    where: { courseId },
    create: { courseId, approvedAt: new Date(), approvedById: user.id, finalisedByOmc: byOmc, overriddenJson: overridden.length ? JSON.stringify(overridden) : null },
    update: { approvedAt: new Date(), approvedById: user.id, finalisedByOmc: byOmc, overriddenJson: overridden.length ? JSON.stringify(overridden) : null, carriedFromBatch: null, carriedFromCourseId: null, carriedApprovedAt: null, recheckedAt: null, updatedAt: new Date() },
  });
  await writeAuditLog({ actorUserId: user.id, action: byOmc ? "SE_PLAN_FINALISED_BY_OMC" : "TEMPLATE_APPROVED", entityType: "Course", entityId: courseId, metadata: { overridden: overridden.join(" | ") } }).catch(() => null);
}

/** OMC suggestions to the Subject Expert (per step / item, each with a reason): the plan goes back for this round. */
export async function suggest(user: { id: string; name: string }, courseId: string, items: { step: string; item?: string; text: string; reason: string }[]) {
  const c = await courseOf(courseId);
  const omc = await omcOfCourse(courseId);
  if (!c || !omc) throw new Error("Course not found.");
  if (!isMember(omc, user.id)) throw new Error("Only a member of this course's OMC makes suggestions.");
  const good = items.filter((i) => i.text?.trim() && i.reason?.trim());
  if (!good.length) throw new Error("Write the suggestion and its reason.");
  const round = (await stateOf(courseId))?.round || 1;
  for (const i of good) await db.sePlanSuggestion.create({ data: { id: randomUUID(), courseId, round, step: String(i.step || "review").slice(0, 30), item: i.item?.slice(0, 200) || null, text: i.text.trim().slice(0, 2000), reason: i.reason.trim().slice(0, 1000), byId: user.id, byName: user.name } });
  if (c.templateStatus === "submitted") await prisma.course.update({ where: { id: courseId }, data: { templateStatus: "changes-requested", omcComment: good.map((g) => `${g.text} — ${g.reason}`).join("\n").slice(0, 2000) } });
  await writeAuditLog({ actorUserId: user.id, action: "SE_PLAN_SUGGESTIONS", entityType: "Course", entityId: courseId, metadata: { round, count: good.length } }).catch(() => null);
  await notifyUsers([c.subjectExpertId], { kind: "TEMPLATE", title: `${c.code}: the OMC suggests ${good.length} change(s) to your plan`, body: good.map((g) => `${g.text} (${g.reason})`).join("; ").slice(0, 500), href: `/subjectexpert/courses/${courseId}/instruments#omc` });
}

/** The Subject Expert answers a suggestion: added to the plan, or a reply with reasons. */
export async function answerSuggestion(user: { id: string }, suggestionId: string, added: boolean, reply: string) {
  const s = await db.sePlanSuggestion.findUnique({ where: { id: suggestionId } });
  if (!s) throw new Error("Suggestion not found.");
  const c = await courseOf(s.courseId);
  if (!c || c.subjectExpertId !== user.id) throw new Error("Only the course's Subject Expert answers.");
  if (!added && reply.trim().length < 3) throw new Error("Give your reason.");
  await db.sePlanSuggestion.update({ where: { id: s.id }, data: { status: added ? "ADDED" : "REPLIED", reply: reply.trim().slice(0, 2000) || null, repliedAt: new Date() } });
}

/** A new round starts each time the Subject Expert submits again. */
export async function newRound(courseId: string) {
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  const hadVotes = s ? await db.sePlanVote.count({ where: { courseId, round: s.round } }).catch(() => 0) : 0;
  if (!s) await db.sePlanState.create({ data: { courseId } }).catch(() => null);
  else if (hadVotes) await db.sePlanState.update({ where: { courseId }, data: { round: s.round + 1, updatedAt: new Date() } });
}

/** When the SE and the OMC don't settle: the Convener finalises the OMC's version, noted for good. */
export async function finaliseByOmc(user: { id: string; name: string }, courseId: string) {
  const c = await courseOf(courseId);
  const v = await voteView(courseId);
  if (!c || !v) throw new Error("Course not found.");
  if (v.convenerId !== user.id) throw new Error("Only the OMC Convener finalises.");
  if (c.templateStatus === "approved") throw new Error("The plan is already approved.");
  const overridden = v.suggestions.filter((s) => s.status !== "ADDED").map((s) => `${s.step}${s.item ? ` · ${s.item}` : ""}: ${s.text}${s.reply ? ` (Subject Expert: ${s.reply})` : ""}`);
  await setApproved(user, courseId, true, overridden);
  await notifyUsers([c.subjectExpertId, c.coordinatorId], { kind: "TEMPLATE", title: `${c.code} plan finalised by the OMC`, body: `${user.name} finalised the OMC's version${overridden.length ? `; ${overridden.length} point(s) the Subject Expert did not accept are recorded` : ""}.`, href: `/subjectexpert/courses/${courseId}/clos` });
  return overridden;
}

/** "Rechecked — no change": clears the warning on a plan carried from the previous batch. */
export async function recheck(user: { id: string }, courseId: string) {
  const c = await courseOf(courseId);
  if (!c || c.subjectExpertId !== user.id) throw new Error("Only the course's Subject Expert rechecks the plan.");
  await db.sePlanState.update({ where: { courseId }, data: { recheckedAt: new Date(), updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "SE_PLAN_RECHECKED", entityType: "Course", entityId: courseId }).catch(() => null);
}

/** The permanent note on a plan the OMC finalised itself (plan, course file, reports). */
export async function omcFinalNote(courseId: string): Promise<string | null> {
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  if (!s?.finalisedByOmc) return null;
  let o: string[] = []; try { o = s.overriddenJson ? JSON.parse(s.overriddenJson) : []; } catch { o = []; }
  return `Finalised by the OMC, not the Subject Expert${o.length ? ` — overridden: ${o.join("; ")}` : ""}.`;
}

/** The SE strip's own marks of a step done ("Next step →"). */
export async function markSeStep(courseId: string, step: string, on: boolean) {
  const s = await db.sePlanState.findUnique({ where: { courseId } }).catch(() => null);
  let marks: Record<string, string> = {}; try { marks = JSON.parse(s?.stepsJson || "{}"); } catch { marks = {}; }
  if (on) marks[step] = new Date().toISOString(); else delete marks[step];
  await db.sePlanState.upsert({ where: { courseId }, create: { courseId, stepsJson: JSON.stringify(marks) }, update: { stepsJson: JSON.stringify(marks), updatedAt: new Date() } });
}
