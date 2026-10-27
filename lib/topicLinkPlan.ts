import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { announceLinkChange, dropReviewPlans, strengthOf } from "./prereqCascade";
import { topicKeyOf } from "./overlapMatrix";
import { requestVotes, voteOnRequest, type RequestKind } from "./omcRules";
import { findCycle, linkSteps, loopText } from "./topicPlanCore";
import { db, MISSING, type Who } from "./topicPlan";

// Topic links drawn in the Topic Workspace. A drawn link is a proposal: the Subject Experts of both courses agree,
// then the Program Lead confirms; a Strong prerequisite also needs two OMC approvals (the same two-vote rule as plan
// changes). Once complete it becomes the very same TopicPrerequisite / TopicOverlapReview row that the Prerequisite
// Topics and Topic Overlaps pages show. Loops between courses are refused, naming the loop.

export type LinkProposalRow = {
  id: string; chairmanId: string; coordinatorId: string; kind: "PREREQ" | "OVERLAP"; level: string; action: "ADD" | "CHANGE" | "REMOVE";
  fromCourseId: string; fromCode: string; fromTopic: string; toCourseId: string; toCode: string; toTopic: string;
  status: string; seFromAt: Date | null; seFromById: string | null; seToAt: Date | null; seToById: string | null; plAt: Date | null; plById: string | null;
  reason: string | null; note: string | null; createdById: string; createdAt: Date; decidedAt: Date | null;
};
const OMC_KIND = "TOPIC_LINK" as RequestKind;
const LEVELS = { PREREQ: ["STRONG", "MILD", "WEAK"], OVERLAP: ["PROGRESSION", "DUPLICATION"] };

/** Course-level prerequisite edges of a program (confirmed topic links, course prerequisites, and links being proposed). */
export async function courseEdges(coordinatorId: string, includePending = true): Promise<[string, string][]> {
  const [links, courses, pending] = await Promise.all([
    prisma.topicPrerequisite.findMany({ where: { coordinatorId, orphanedAt: null }, select: { prereqCourseCode: true, dependentCourseCode: true } }).catch(() => []),
    prisma.course.findMany({ where: { coordinatorId, prerequisiteCourseId: { not: null } }, select: { code: true, prerequisiteCourse: { select: { code: true } } } }),
    includePending ? (db.topicLinkProposal.findMany({ where: { coordinatorId, status: "PENDING", kind: "PREREQ", action: { not: "REMOVE" } } }).catch(() => []) as Promise<LinkProposalRow[]>) : Promise.resolve([] as LinkProposalRow[]),
  ]);
  const e = new Map<string, [string, string]>();
  for (const l of links) e.set(`${l.prereqCourseCode}>${l.dependentCourseCode}`, [l.prereqCourseCode, l.dependentCourseCode]);
  for (const c of courses) if (c.prerequisiteCourse && c.prerequisiteCourse.code !== c.code) e.set(`${c.prerequisiteCourse.code}>${c.code}`, [c.prerequisiteCourse.code, c.code]);
  for (const p of pending) e.set(`${p.fromCode}>${p.toCode}`, [p.fromCode, p.toCode]);
  return Array.from(e.values());
}

export async function proposeLink(user: Who, b: { kind: string; level: string; action?: string; fromCourseId: string; fromTopic: string; toCourseId: string; toTopic: string; note?: string }) {
  const kind = b.kind === "OVERLAP" ? "OVERLAP" : "PREREQ";
  const level = String(b.level || "").toUpperCase();
  if (!LEVELS[kind].includes(level)) return { error: `Choose ${LEVELS[kind].join(", ").toLowerCase()}.`, status: 400 };
  const action = b.action === "REMOVE" ? "REMOVE" : b.action === "CHANGE" ? "CHANGE" : "ADD";
  const fromTopic = String(b.fromTopic || "").trim().slice(0, 300), toTopic = String(b.toTopic || "").trim().slice(0, 300);
  if (!fromTopic || !toTopic) return { error: "Pick a topic at each end.", status: 400 };
  const chairmanId = await chairmanIdFor(user);
  const sel = { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, semesterNumber: true, coordinator: { select: { managedById: true } } } as const;
  const [f, t] = await Promise.all([prisma.course.findUnique({ where: { id: b.fromCourseId }, select: sel }), prisma.course.findUnique({ where: { id: b.toCourseId }, select: sel })]);
  if (!f || !t || f.coordinator.managedById !== chairmanId || t.coordinator.managedById !== chairmanId) return { error: "course not found", status: 404 };
  if (f.code === t.code) return { error: "Link topics of two different courses.", status: 400 };
  if (f.coordinatorId !== t.coordinatorId) return { error: "Topic links are kept per program; these two courses belong to different programs.", status: 400 };
  try { await db.topicLinkProposal.count({ where: { id: "none" } }); } catch { return { error: MISSING, status: 500 }; }
  if (kind === "PREREQ" && action !== "REMOVE") {
    const loop = findCycle(await courseEdges(f.coordinatorId), [f.code, t.code]);
    if (loop) return { error: loopText(loop), loop, status: 409 };
  }
  const dup = await db.topicLinkProposal.findFirst({ where: { coordinatorId: f.coordinatorId, status: "PENDING", fromCode: f.code, toCode: t.code, fromTopic, toTopic, kind } });
  if (dup) return { error: "This link is already waiting for approval.", status: 409 };
  const now = new Date();
  const data: Record<string, unknown> = { id: randomUUID(), chairmanId, coordinatorId: f.coordinatorId, kind, level, action, fromCourseId: f.id, fromCode: f.code, fromTopic, toCourseId: t.id, toCode: t.code, toTopic, note: b.note?.trim().slice(0, 1000) || null, createdById: user.id };
  // The proposer's own agreement counts.
  if (user.role === "SUBJECT_EXPERT" && f.subjectExpertId === user.id) Object.assign(data, { seFromAt: now, seFromById: user.id });
  if (user.role === "SUBJECT_EXPERT" && t.subjectExpertId === user.id) Object.assign(data, { seToAt: now, seToById: user.id });
  if (!f.subjectExpertId) Object.assign(data, { seFromAt: now, seFromById: null });
  if (!t.subjectExpertId) Object.assign(data, { seToAt: now, seToById: null });
  const p = (await db.topicLinkProposal.create({ data })) as LinkProposalRow;
  await notifyUsers([data.seFromAt ? null : f.subjectExpertId, data.seToAt ? null : t.subjectExpertId], { kind: "TOPIC_SUGGESTION", title: `${user.name} proposes a topic link: ${f.code} "${fromTopic}" → ${t.code} "${toTopic}"`, body: `${kind === "PREREQ" ? `${level.toLowerCase()} prerequisite` : level.toLowerCase()}${action !== "ADD" ? ` (${action.toLowerCase()})` : ""}. Agree or decline in the Topic Workspace.`, href: "/faculty/topic-workspace?tab=proposals", exceptId: user.id });
  await advance(p, user);
  return { proposal: p, status: 200 };
}

/** Who has to act next, and whether this person can. */
export async function linkState(p: LinkProposalRow, user?: Who) {
  const votes = p.kind === "PREREQ" && p.level === "STRONG" ? await requestVotes(OMC_KIND, p.id, p.toCourseId).catch(() => null) : null;
  const s = linkSteps(p, votes?.yes || 0);
  let canAct: string | null = null;
  if (user && p.status === "PENDING") {
    const [f, t] = await Promise.all([prisma.course.findUnique({ where: { id: p.fromCourseId }, select: { subjectExpertId: true } }), prisma.course.findUnique({ where: { id: p.toCourseId }, select: { subjectExpertId: true } })]);
    if (!p.seFromAt && f?.subjectExpertId === user.id) canAct = "SE_FROM";
    else if (!p.seToAt && t?.subjectExpertId === user.id) canAct = "SE_TO";
    else if (p.seFromAt && p.seToAt && !p.plAt && user.id === p.coordinatorId) canAct = "PL";
    else if (p.plAt && votes && !votes.decided && votes.voters.some((v) => v.id === user.id) && !votes.votes.some((v) => v.memberId === user.id)) canAct = "OMC";
  }
  return { ...s, votes: votes?.line || null, canAct };
}

export async function answerLink(user: Who, id: string, approve: boolean, reason = "") {
  const p = (await db.topicLinkProposal.findUnique({ where: { id } }).catch(() => null)) as LinkProposalRow | null;
  if (!p) return { error: "not found", status: 404 };
  if (p.status !== "PENDING") return { error: "This link has already been decided.", status: 409 };
  const st = await linkState(p, user);
  if (!st.canAct) return { error: `Waiting for: ${st.waiting.join(", ")}.`, status: 403 };
  if (!approve && reason.trim().length < 3) return { error: "Give the reason for declining.", status: 400 };
  const now = new Date();
  if (st.canAct === "OMC") {
    const v = await voteOnRequest({ id: user.id, name: user.name }, OMC_KIND, p.id, p.toCourseId, approve, reason).catch((e: Error) => ({ error: e.message }));
    if ("error" in v) return { error: v.error, status: 403 };
    if (v.decided === "rejected") return finish(p, user, false, `OMC: ${v.line}`);
  } else if (!approve) {
    return finish(p, user, false, reason);
  } else {
    const data = st.canAct === "SE_FROM" ? { seFromAt: now, seFromById: user.id } : st.canAct === "SE_TO" ? { seToAt: now, seToById: user.id } : { plAt: now, plById: user.id };
    Object.assign(p, data);
    await db.topicLinkProposal.update({ where: { id }, data });
  }
  return advance(p, user);
}

/** After a step: notify the next people, or confirm once every approval is in. */
async function advance(p: LinkProposalRow, user: Who) {
  const st = await linkState(p);
  if (st.complete) return finish(p, user, true, "");
  const next = !p.seFromAt || !p.seToAt ? null : !p.plAt ? "PL" : "OMC";
  if (next === "PL") await notifyUsers([p.coordinatorId], { kind: "TOPIC_SUGGESTION", title: `Confirm a topic link: ${p.fromCode} "${p.fromTopic}" → ${p.toCode} "${p.toTopic}"`, body: `Both Subject Experts agreed (${p.kind === "PREREQ" ? `${p.level.toLowerCase()} prerequisite` : p.level.toLowerCase()}).`, href: "/topic-prerequisites", exceptId: user.id });
  if (next === "OMC") {
    const v = await requestVotes(OMC_KIND, p.id, p.toCourseId).catch(() => null);
    await notifyUsers((v?.voters || []).map((m) => m.id), { kind: "REQUEST", title: `Strong prerequisite needs OMC approval: ${p.fromCode} → ${p.toCode}`, body: `"${p.fromTopic}" → "${p.toTopic}". Students won't be able to register for ${p.toCode} without it; 2 approvals are needed.`, href: "/topic-prerequisites", exceptId: user.id });
  }
  return { ok: true, waiting: st.waiting, status: 200 };
}

async function finish(p: LinkProposalRow, user: Who, ok: boolean, reason: string) {
  const now = new Date();
  if (!ok) {
    await db.topicLinkProposal.update({ where: { id: p.id }, data: { status: "REJECTED", reason: reason.slice(0, 1000), decidedAt: now } });
    await notifyUsers([p.createdById], { kind: "TOPIC_SUGGESTION", title: `Topic link declined: ${p.fromCode} → ${p.toCode}`, body: `${user.name}: ${reason}`, href: "/faculty/topic-workspace?tab=proposals", exceptId: user.id });
    return { ok: true, rejected: true, status: 200 };
  }
  const [f, t] = await Promise.all([prisma.course.findUnique({ where: { id: p.fromCourseId }, select: { title: true } }), prisma.course.findUnique({ where: { id: p.toCourseId }, select: { title: true } })]);
  if (p.kind === "PREREQ") {
    const where = { coordinatorId_prereqCourseCode_prereqTopic_dependentCourseCode_dependentTopic: { coordinatorId: p.coordinatorId, prereqCourseCode: p.fromCode, prereqTopic: p.fromTopic, dependentCourseCode: p.toCode, dependentTopic: p.toTopic } };
    if (p.action === "REMOVE") {
      const old = await prisma.topicPrerequisite.findUnique({ where }).catch(() => null);
      if (old) { await dropReviewPlans(old); await prisma.topicPrerequisite.delete({ where: { id: old.id } }); await announceLinkChange(old, "REMOVED", user).catch(() => null); }
    } else {
      const before = await prisma.topicPrerequisite.findUnique({ where }).catch(() => null);
      const strength = strengthOf(p.level);
      const link = await prisma.topicPrerequisite.upsert({ where, create: { chairmanId: p.chairmanId, coordinatorId: p.coordinatorId, prereqCourseCode: p.fromCode, prereqCourseTitle: f?.title || p.fromCode, prereqTopic: p.fromTopic, dependentCourseCode: p.toCode, dependentCourseTitle: t?.title || p.toCode, dependentTopic: p.toTopic, note: p.note, strength, createdById: p.createdById }, update: { strength, orphanedAt: null } });
      if (strength === "STRONG") await dropReviewPlans(link);
      if (!before || before.strength !== strength) await announceLinkChange(link, before ? "STRENGTH" : "ADDED", user).catch(() => null);
    }
  } else {
    const [codeA, codeB] = [p.fromCode, p.toCode].sort();
    const [topicA, topicB] = codeA === p.fromCode ? [p.fromTopic, p.toTopic] : [p.toTopic, p.fromTopic];
    const topicKey = topicKeyOf(topicA, topicB);
    if (p.action === "REMOVE") await prisma.topicOverlapReview.deleteMany({ where: { coordinatorId: p.coordinatorId, codeA, codeB, topicKey } });
    else await prisma.topicOverlapReview.upsert({ where: { coordinatorId_codeA_codeB_topicKey: { coordinatorId: p.coordinatorId, codeA, codeB, topicKey } }, create: { coordinatorId: p.coordinatorId, codeA, codeB, topicKey, topicA, topicB, verdict: p.level, note: p.note, byId: user.id }, update: { verdict: p.level, byId: user.id } });
  }
  await db.topicLinkProposal.update({ where: { id: p.id }, data: { status: "CONFIRMED", decidedAt: now } });
  await writeAuditLog({ actorUserId: user.id, action: "TOPIC_LINK_CONFIRMED", entityType: "TopicLinkProposal", entityId: p.id, metadata: { from: `${p.fromCode}: ${p.fromTopic}`, to: `${p.toCode}: ${p.toTopic}`, level: p.level, action: p.action } }).catch(() => null);
  await notifyUsers([p.createdById, p.seFromById, p.seToById], { kind: "TOPIC_SUGGESTION", title: `Topic link confirmed: ${p.fromCode} → ${p.toCode}`, body: `"${p.fromTopic}" → "${p.toTopic}" (${p.level.toLowerCase()}${p.action !== "ADD" ? `, ${p.action.toLowerCase()}` : ""}).`, href: "/faculty/topic-workspace", exceptId: user.id });
  return { ok: true, confirmed: true, status: 200 };
}

/** Link proposals this person can see: ones they made, ones waiting on them, and (PL/OMC) their program's. */
export async function linkProposalsFor(user: Who) {
  try {
    const chairmanId = await chairmanIdFor(user);
    const mine = await prisma.course.findMany({ where: { OR: [{ subjectExpertId: user.id }, { coordinatorId: user.id }] }, select: { id: true } });
    const ids = mine.map((c) => c.id).concat("none");
    const rows = (await db.topicLinkProposal.findMany({
      where: { chairmanId, OR: [{ createdById: user.id }, { fromCourseId: { in: ids } }, { toCourseId: { in: ids } }, { coordinatorId: user.id }, ...(user.role === "OMC" ? [{ level: "STRONG", status: "PENDING" }] : [])] },
      orderBy: { createdAt: "desc" }, take: 200,
    })) as LinkProposalRow[];
    const out = [];
    for (const p of rows) out.push({ ...p, state: await linkState(p, user) });
    return { rows: out, missingTable: false };
  } catch { return { rows: [], missingTable: true }; }
}
