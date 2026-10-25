import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { departmentOfCourse, omcCommittee, majority, isConvener, onCommittee } from "./omcCommittee";
import { planApproved } from "./registrationGate";

// OMC approval of a Subject Expert's course plan by voting. Each submission is a round; members vote approve / not
// approve ("Votes: 2 of 5 approved · 1 not · waiting: A, B"); on a majority the Convener confirms. Members send
// suggestions; the SE adds them or replies with reasons, over several rounds (a resubmission opens a new round). If it
// does not settle, the Convener finalises — the plan then carries the permanent note below. A plan linked by content
// sync to an approved base counts as approved, with a "please recheck" until the SE presses "Rechecked — no change".

const db = prisma as unknown as Record<string, any>;
export const OMC_FINAL_NOTE = "Finalised by the OMC, not the Subject Expert";
export type Thread = { id: string; courseId: string; round: number; parentId: string | null; byId: string; byName: string; side: string; kind: string; step: string | null; text: string; at: Date };

export async function planState(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, templateStatus: true, subjectExpertId: true, batch: { select: { batchName: true, degreeProgram: true } }, contentSyncMember: { select: { groupId: true } } } });
  if (!c) return null;
  const ps = (await db.planState.findUnique({ where: { courseId } }).catch(() => null)) as { round: number; status: string; recheckedAt: Date | null; omcFinal: boolean; finalNote: string | null } | null;
  const round = ps?.round || 1;
  const votes = ((await db.planVote.findMany({ where: { courseId, round } }).catch(() => [])) as { userId: string; userName: string; approve: boolean; comment: string | null; at: Date }[]);
  const thread = ((await db.planThread.findMany({ where: { courseId }, orderBy: { at: "asc" } }).catch(() => [])) as Thread[]);
  const d = await departmentOfCourse(courseId);
  const com = await omcCommittee(d.chairmanId, d.departmentId);
  const yes = votes.filter((v) => v.approve && com.all.includes(v.userId)).length, no = votes.filter((v) => !v.approve && com.all.includes(v.userId)).length;
  const waiting = com.all.filter((id) => !votes.some((v) => v.userId === id)).map((id) => com.names.get(id) || "?");
  // Approved before: the same course (content-sync group) approved for another batch.
  const mates = c.contentSyncMember ? await prisma.courseContentSyncMember.findMany({ where: { groupId: c.contentSyncMember.groupId, courseId: { not: courseId } }, select: { courseId: true, course: { select: { templateStatus: true, batch: { select: { degreeProgram: true, batchName: true } } } } } }) : [];
  const mateStates = ((await db.planState.findMany({ where: { courseId: { in: mates.map((m) => m.courseId).concat("none") } } }).catch(() => [])) as { courseId: string; at: Date }[]);
  const before = mates.filter((m) => m.course.templateStatus === "approved").map((m) => { const at = mateStates.find((x) => x.courseId === m.courseId)?.at; return `${m.course.batch?.degreeProgram || ""} ${m.course.batch?.batchName || ""}${at ? ` (${new Date(at).toLocaleDateString("en-GB")})` : ""}`.trim(); });
  const synced = (await planApproved([courseId])).get(courseId)?.synced || false;
  return { c, ps, round, votes, thread, com, yes, no, total: com.all.length, waiting, canConfirm: majority(yes, com.all.length), before, synced };
}

/** Called when the SE submits: a resubmission after suggestions opens a new round (votes start again). */
export async function onSubmit(courseId: string) {
  const ps = await db.planState.findUnique({ where: { courseId } }).catch(() => null);
  if (!ps) { await db.planState.create({ data: { courseId, round: 1, status: "SUBMITTED" } }).catch(() => null); return; }
  if (ps.status !== "APPROVED") await db.planState.update({ where: { courseId }, data: { round: ps.round + 1, status: "SUBMITTED", at: new Date() } }).catch(() => null);
}

export async function planAct(user: { id: string; name: string; role: string }, courseId: string, body: any): Promise<{ ok: true } | { error: string }> {
  const st = await planState(courseId);
  if (!st) return { error: "Course not found." };
  const a = String(body.action || "");
  const member = onCommittee(st.com, user.id) || user.role === "OMC";
  const se = st.c.subjectExpertId === user.id;
  const note = String(body.comment ?? body.note ?? body.text ?? "").trim();
  const omcHref = `/omc/templates/${courseId}`, seHref = `/subjectexpert/courses/${courseId}/clos`;
  const ensure = async () => { if (!st.ps) await db.planState.create({ data: { courseId, round: 1, status: "SUBMITTED" } }).catch(() => null); };

  if (a === "vote") {
    if (!member) return { error: "Only OMC members vote." };
    if (st.ps?.status === "APPROVED") return { error: "Already approved." };
    await ensure();
    const approve = !(body.approve === false || body.approve === "no");
    if (!approve && !note) return { error: "Say what should change." };
    await db.planVote.upsert({ where: { courseId_round_userId: { courseId, round: st.round, userId: user.id } }, create: { courseId, round: st.round, userId: user.id, userName: user.name, approve, comment: note || null }, update: { approve, comment: note || null, at: new Date() } });
    if (!approve) {
      await db.planThread.create({ data: { id: randomUUID(), courseId, round: st.round, byId: user.id, byName: user.name, side: "OMC", kind: "SUGGESTION", step: body.step || null, text: note } });
      await notifyUsers([st.c.subjectExpertId], { kind: "TEMPLATE", title: `OMC suggestion on ${st.c.code}`, body: `${user.name}: ${note}. Add it or reply with your reason.`, href: seHref });
    }
    const after = await planState(courseId);
    if (after?.canConfirm && st.com.convenerId) await notifyUsers([st.com.convenerId], { kind: "TEMPLATE", title: `${st.c.code} plan: majority approved — confirm`, body: `Votes: ${after.yes} of ${after.total} approved.`, href: omcHref });
    return { ok: true };
  }
  if (a === "suggest") {
    if (!member) return { error: "Only OMC members." };
    if (!note) return { error: "Write the suggestion." };
    await ensure();
    await db.planThread.create({ data: { id: randomUUID(), courseId, round: st.round, byId: user.id, byName: user.name, side: "OMC", kind: "SUGGESTION", step: body.step || null, text: note } });
    await notifyUsers([st.c.subjectExpertId], { kind: "TEMPLATE", title: `OMC suggestion on ${st.c.code}`, body: `${user.name}: ${note}`, href: seHref });
    return { ok: true };
  }
  if (a === "reply") {
    if (!se) return { error: "Only the course's Subject Expert replies." };
    const p = st.thread.find((t) => t.id === body.parentId); if (!p) return { error: "Suggestion not found." };
    const kind = body.kind === "ADDED" ? "ADDED" : "REPLY";
    if (kind === "REPLY" && !note) return { error: "Give your reason." };
    await db.planThread.create({ data: { id: randomUUID(), courseId, round: st.round, parentId: p.id, byId: user.id, byName: user.name, side: "SE", kind, text: note || "Added to the plan." } });
    await notifyUsers([p.byId], { kind: "TEMPLATE", title: `${st.c.code}: Subject Expert ${kind === "ADDED" ? "added your suggestion" : "replied"}`, body: note || "Added.", href: omcHref });
    return { ok: true };
  }
  if (a === "recheck") {
    if (!se) return { error: "Only the course's Subject Expert." };
    await db.planState.upsert({ where: { courseId }, create: { courseId, round: 1, status: "APPROVED", recheckedAt: new Date() }, update: { recheckedAt: new Date() } });
    return { ok: true };
  }
  if (a === "confirm" || a === "finalise") {
    if (!isConvener(st.com, user.id)) return { error: "Only the OMC Convener." };
    if (a === "confirm" && !st.canConfirm) return { error: `A majority must approve first (${st.yes} of ${st.total}).` };
    await ensure();
    const omcFinal = a === "finalise";
    await db.planState.update({ where: { courseId }, data: { status: "APPROVED", omcFinal, finalNote: omcFinal ? `${OMC_FINAL_NOTE}${note ? ` — ${note}` : ""}` : null, decidedById: user.id, at: new Date() } });
    await prisma.course.update({ where: { id: courseId }, data: { templateStatus: "approved", templateReviewedById: user.id, ...(omcFinal ? { omcComment: `${OMC_FINAL_NOTE}${note ? ` — ${note}` : ""}` } : {}) } });
    await notifyUsers([st.c.subjectExpertId, ...st.com.all], { kind: "TEMPLATE", title: `${st.c.code} plan approved${omcFinal ? " — finalised by the OMC" : ""}`, body: omcFinal ? OMC_FINAL_NOTE : `Confirmed by ${user.name} (votes ${st.yes} of ${st.total}).`, href: seHref, exceptId: user.id });
    return { ok: true };
  }
  return { error: "Unknown action." };
}
